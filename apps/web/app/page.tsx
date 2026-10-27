import Hero from '@/components/landing/Hero';
import PortalZoom from '@/components/landing/PortalZoom';
import FooterScene from '@/components/landing/FooterScene';
import Story from '@/components/landing/Story';

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <PortalZoom />
      <Story />
      <FooterScene />
    </main>
  );
}
