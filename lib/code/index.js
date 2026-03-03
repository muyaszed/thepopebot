import dynamic from 'next/dynamic';

export const CodePage = dynamic(() => import('./code-page.js'), { ssr: false });
