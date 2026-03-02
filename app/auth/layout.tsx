import HeroSection from "@/components/hero-section";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeroSection
      showHeroContent={false}
      showSliderNav={false}
      showNavigation={false}
      overlay={<div className="h-full overflow-y-auto">{children}</div>}
    />
  );
}
