import Hero from '@/components/landing/Hero';
import PortalZoom from '@/components/landing/PortalZoom';
import Story from '@/components/landing/Story';
import Docs from '@/components/landing/Docs';
import FooterScene from '@/components/landing/FooterScene';

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <PortalZoom />
      <Story />
      <Docs />
      <FooterScene />
    </main>
  );
}
