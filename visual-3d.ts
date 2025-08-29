/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private circle!: Line2;
  private segments = 256;

  private smoothedRadii = new Float32Array(this.segments).fill(1.1);
  private smoothedZ = new Float32Array(this.segments).fill(0);
  private smoothingFactor = 0.4;

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      z-index: 1;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setClearColor(0x000000, 0); // Set background to transparent
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const radius = 1.1;
    const positions = new Float32Array((this.segments + 1) * 3);

    for (let i = 0; i <= this.segments; i++) {
      const angle = (i / this.segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = 0;
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = new LineMaterial({
      color: 0xffffff,
      linewidth: 5, // in pixels
    });
    material.resolution.set(window.innerWidth, window.innerHeight);

    const circle = new Line2(geometry, material);
    scene.add(circle);
    this.circle = circle;

    const renderPass = new RenderPass(scene, camera);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      if (this.circle) {
        (this.circle.material as LineMaterial).resolution.set(
          window.innerWidth,
          window.innerHeight,
        );
      }
    };

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (!this.inputAnalyser || !this.outputAnalyser || !this.circle) {
      return;
    }

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const positions = new Float32Array((this.segments + 1) * 3);
    const baseRadius = 1.1;
    const inputData = this.inputAnalyser.data;
    const outputData = this.outputAnalyser.data;
    const dataLength = inputData.length;

    if (!dataLength) return;

    // --- Shape logic ---
    for (let i = 0; i < this.segments; i++) {
      // Symmetrically map the frequency data to the circle.
      // This maps the low-to-high frequency range to the right half of the
      // circle, and then mirrors it (high-to-low) for the left half,
      // creating a horizontally symmetrical visualization.
      let dataRatio;
      const halfSegments = this.segments / 2;
      if (i <= halfSegments) {
        // First half of the circle (0 to PI radians)
        dataRatio = i / halfSegments;
      } else {
        // Second half of the circle (PI to 2*PI radians)
        dataRatio = (this.segments - i) / halfSegments;
      }

      const dataPos = dataRatio * (dataLength - 1);
      const dataIndex = Math.floor(dataPos);
      const nextDataIndex = Math.min(dataIndex + 1, dataLength - 1);
      const lerpFactor = dataPos - dataIndex;

      const inputMagnitude =
        THREE.MathUtils.lerp(
          inputData[dataIndex],
          inputData[nextDataIndex],
          lerpFactor,
        ) / 255;
      const outputMagnitude =
        THREE.MathUtils.lerp(
          outputData[dataIndex],
          outputData[nextDataIndex],
          lerpFactor,
        ) / 255;

      // Smoothly update radius based on input
      const targetRadius = baseRadius + inputMagnitude * 1.1;
      this.smoothedRadii[i] = THREE.MathUtils.lerp(
        this.smoothedRadii[i],
        targetRadius,
        this.smoothingFactor,
      );
      const radius = this.smoothedRadii[i];

      // Smoothly update z-offset based on output
      const targetZ = (outputMagnitude - 0.1) * 2.0;
      this.smoothedZ[i] = THREE.MathUtils.lerp(
        this.smoothedZ[i],
        targetZ,
        this.smoothingFactor,
      );
      const zOffset = this.smoothedZ[i];

      const angle = (i / this.segments) * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = zOffset;
    }

    // copy first point to last to close the loop
    positions[this.segments * 3] = positions[0];
    positions[this.segments * 3 + 1] = positions[1];
    positions[this.segments * 3 + 2] = positions[2];

    this.circle.geometry.setPositions(positions);
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
