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

      {/* Footer Links */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li><Link href="/pricing" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Pricing</Link></li>
                <li><Link href="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Dashboard</Link></li>
                <li><Link href="/mcp" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">MCP Config</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li><a href="https://github.com/kotadb/kotadb" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Documentation</a></li>
                <li><a href="https://github.com/kotadb/kotadb/issues" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Support</a></li>
                <li><a href="https://github.com/kotadb/kotadb" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li><a href="https://github.com/kotadb/kotadb#about" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">About</a></li>
                <li><a href="https://github.com/kotadb/kotadb/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">License</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Connect</h3>
              <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                <li><a href="https://github.com/kotadb/kotadb" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">GitHub</a></li>
                <li><a href="https://twitter.com/kotadb" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Twitter</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 text-center text-gray-600 dark:text-gray-400">
            <p>&copy; 2025 KotaDB. Code Intelligence for AI Agents.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
