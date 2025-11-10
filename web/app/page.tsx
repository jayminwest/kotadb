import LandingHero from '@/components/LandingHero'
import FeatureShowcase from '@/components/FeatureShowcase'
import UserJourney from '@/components/UserJourney'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="space-y-0 -mx-4 -my-8">
      <LandingHero />
      <FeatureShowcase />
      <UserJourney />

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-bold">
            Ready to enhance your AI agents?
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Join developers using KotaDB to make Claude Code smarter about their codebases
          </p>
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-block px-8 py-4 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
