// pages/_app.js
import '@solana/wallet-adapter-react-ui/styles.css';
import '../styles/minimal.css';

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}