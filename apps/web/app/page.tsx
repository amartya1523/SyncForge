import { Architecture } from '@/components/landing/architecture'
import { FinalCta, Footer } from '@/components/landing/closing'
import { Features } from '@/components/landing/features'
import { FivePerson } from '@/components/landing/five-person'
import { Hero } from '@/components/landing/hero'
import { Nav } from '@/components/landing/nav'
import { Proof } from '@/components/landing/proof'

export default function LandingPage() {
  return (
    <div className="relative overflow-x-clip">
      <Nav />
      <main>
        <Hero />
        <Proof />
        <FivePerson />
        <Features />
        <Architecture />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
