export const metadata = {
  title: 'IELTS Examiner (Next.js)',
  description: 'IELTS Speaking practice',
};

import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

