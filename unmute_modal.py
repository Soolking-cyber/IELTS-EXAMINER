from modal import Image, App, asgi_app, Secret, gpu

# GPU image with build tools and ffmpeg
image = (
    Image.debian_slim()
    .apt_install(
        "ffmpeg",
        "curl",
        "pkg-config",
        "build-essential",
        "cmake",
        "libssl-dev",
        "python3-venv",
        "git",
    )
    .pip_install(
        [
            "fastapi==0.115.6",
            "uvicorn==0.34.0",
            "httpx==0.27.2",
            "python-multipart==0.0.9",
            "faster-whisper==1.0.3",
        ]
    )
)

app = App("unmute-backend-modal", image=image)

CONFIGS_LOCAL = "/root/configs"


@app.function(gpu="A10G", secrets=[Secret.from_name("hf"), Secret.from_name("openrouter")])
@asgi_app()
def unmute_app():
    import os
    import subprocess
    import shutil
    import time
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    import httpx

    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def ensure_rust():
        if shutil.which("cargo"):
            return
        subprocess.run(
            [
                "bash",
                "-lc",
                "curl -fsSL https://sh.rustup.rs -sSf | sh -s -- -y && source $HOME/.cargo/env",
            ],
            check=True,
        )

    def ensure_moshi():
        if shutil.which("moshi-server"):
            return
        env = os.environ.copy()
        env.setdefault("CXXFLAGS", "-include cstdint")
        try:
            subprocess.run([
                "bash","-lc",
                "source $HOME/.cargo/env || true; cargo install --features cuda moshi-server@0.6.3"], check=True, env=env)
        except subprocess.CalledProcessError:
            subprocess.run([
                "bash","-lc",
                "source $HOME/.cargo/env || true; cargo install moshi-server@0.6.3"], check=True, env=env)

    def _child_env():
        env = os.environ.copy()
        # Add Python LIBDIR to LD_LIBRARY_PATH (matches vendor start scripts)
        try:
            libdir = subprocess.check_output([
                "python3","-c","import sysconfig; print(sysconfig.get_config_var('LIBDIR') or '')"
            ], text=True).strip()
            if libdir:
                prev = env.get("LD_LIBRARY_PATH", "")
                env["LD_LIBRARY_PATH"] = f"{libdir}:{prev}" if prev else libdir
        except Exception:
            pass
        return env

    @app.on_event("startup")
    async def startup():
        import asyncio
        ensure_rust()
        ensure_moshi()
        # Copy configs into container path
        os.makedirs("/root/configs", exist_ok=True)
        # Try to copy from mounted working dir if present
        src = "/root/project/vendor/unmute/services/moshi-server/configs"
        if os.path.isdir(src):
            subprocess.run(["bash","-lc", f"cp -r {src}/* {CONFIGS_LOCAL}/ || true"], check=False)
        # Start TTS and STT workers with log capture and env
        tts_log = open("/tmp/moshi-tts.log", "a+")
        stt_log = open("/tmp/moshi-stt.log", "a+")
        app.state._tts_log = tts_log
        app.state._stt_log = stt_log
        env = _child_env()
        app.state.tts = subprocess.Popen(
            [
                "bash",
                "-lc",
                f"source $HOME/.cargo/env || true; moshi-server worker --config {CONFIGS_LOCAL}/tts.toml --port 8089",
            ],
            stdout=tts_log,
            stderr=tts_log,
            env=env,
        )
        app.state.stt = subprocess.Popen(
            [
                "bash",
                "-lc",
                f"source $HOME/.cargo/env || true; moshi-server worker --config {CONFIGS_LOCAL}/stt.toml --port 8090",
            ],
            stdout=stt_log,
            stderr=stt_log,
            env=env,
        )
        # Wait until workers respond
        async with httpx.AsyncClient(timeout=5) as client:
            for _ in range(180):
                try:
                    r1 = await client.get("http://127.0.0.1:8089/health")
                    r2 = await client.get("http://127.0.0.1:8090/health")
                    if r1.status_code < 500 and r2.status_code < 500:
                        break
                except Exception:
                    pass
                await asyncio.sleep(1)

    @app.on_event("shutdown")
    async def shutdown():
        for p in (getattr(app.state, "tts", None), getattr(app.state, "stt", None)):
            if p and p.poll() is None:
                try:
                    p.terminate()
                except Exception:
                    pass

    @app.get("/health")
    async def health():
        ok = True
        async with httpx.AsyncClient(timeout=2) as client:
            try:
                await client.get("http://127.0.0.1:8089/health")
                await client.get("http://127.0.0.1:8090/health")
            except Exception:
                ok = False
        return {"status": "ok" if ok else "degraded"}

    @app.post("/tts")
    async def tts(payload: dict):
        text = (payload or {}).get("text", "").strip()
        if not text:
            return {"error": "no_text"}, 400
        async with httpx.AsyncClient(timeout=120) as client:
            try:
                r = await client.post(
                    "http://127.0.0.1:8089/api/tts_streaming",
                    json={"text": text, "voice": payload.get("voice")},
                )
                if r.status_code >= 400:
                    return {"error": "upstream_error", "status": r.status_code, "body": r.text[:500]}, r.status_code
                ct = r.headers.get("content-type", "application/json")
                if ct.startswith("application/json"):
                    return r.json()
                return {"audio": r.text}
            except Exception as e:
                return {"error": "tts_failed", "detail": str(e)}, 500

    @app.get("/debug/logs")
    async def debug_logs():
        t, s = "", ""
        try:
            with open("/tmp/moshi-tts.log", "r") as f:
                t = f.read()[-5000:]
        except Exception:
            pass
        try:
            with open("/tmp/moshi-stt.log", "r") as f:
                s = f.read()[-5000:]
        except Exception:
            pass
        return {"tts": t, "stt": s}

    @app.post("/stt")
    async def stt_proxy(audio: bytes = None):
        # Accept multipart or raw bytes and transcribe with faster-whisper as a bridge
        import tempfile, os, subprocess
        from faster_whisper import WhisperModel
        # Read body
        body = None
        if audio is not None and len(audio) > 0:
            body = audio
        else:
            # In case of multipart/form-data, FastAPI parsed file is not bound in this signature.
            # Attempt to read from request stream is complex here; recommend client send as raw or form field name 'audio'.
            pass
        if not body:
            return {"text": "", "note": "empty_or_short_chunk"}, 200

        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(body)
            tmp.flush()
            in_path = tmp.name
        wav_path = in_path + ".wav"
        try:
            # Transcode to 16k mono wav
            cmd = [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", in_path,
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                wav_path,
            ]
            r = subprocess.run(cmd, check=False, capture_output=True, text=True)
            if r.returncode != 0:
                return {"text": "", "error": "ffmpeg_failed", "stderr": (r.stderr or "")[:500]}, 200
            try:
                if os.path.getsize(wav_path) < 1024:
                    return {"text": "", "note": "empty_or_short_chunk"}, 200
            except Exception:
                return {"text": "", "note": "no_output_file"}, 200
            # Transcribe
            model = getattr(app.state, "whisper_model", None)
            if model is None:
                model = WhisperModel("small.en", compute_type="int8")
                app.state.whisper_model = model
            segments, info = model.transcribe(wav_path, beam_size=5, language="en")
            text = "".join(seg.text for seg in segments).strip()
            return {"text": text, "language": getattr(info, 'language', 'en'), "duration": getattr(info, 'duration', 0)}
        finally:
            for p in (in_path, wav_path):
                try:
                    os.remove(p)
                except Exception:
                    pass

    # OpenRouter LLM proxy (same model as before)
    @app.post("/llm")
    async def llm(payload: dict):
        import httpx, os
        OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
        if not OPENROUTER_API_KEY:
            return {"error": "OPENROUTER_API_KEY not configured"}, 500
        model = payload.get("model") or "openai/gpt-oss-20b:free"
        messages = payload.get("messages") or []
        system = payload.get("system")
        if system:
            messages = [{"role": "system", "content": system}] + messages
        data = {
            "model": model,
            "messages": messages,
            "temperature": payload.get("temperature", 0.6),
        }
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("SITE_URL", "https://example.com"),
            "X-Title": "IELTS-EXAMINER",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post("https://openrouter.ai/api/v1/chat/completions", json=data, headers=headers)
            if r.status_code >= 400:
                return {"error": "upstream_error", "status": r.status_code, "body": r.text[:500]}, r.status_code
            try:
                obj = r.json()
                content = obj.get("choices", [{}])[0].get("message", {}).get("content", "")
                return {"text": content}
            except Exception:
                return {"raw": r.text}, 200

    return app
