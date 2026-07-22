import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'RE-Agent', description: 'RE-Agent infrastructure status' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
