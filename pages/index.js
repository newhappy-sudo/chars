// pages/index.js
import dynamic from 'next/dynamic';

const SolanaCoffeeEnglish = dynamic(
  () => import('../components/SolanaCoffeeEnglish'),
  { ssr: false }
);

export default function Home() {
  return <SolanaCoffeeEnglish />;
}