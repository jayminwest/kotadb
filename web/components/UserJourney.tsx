export default function UserJourney() {
  const steps = [
    {
      number: '1',
      title: 'Sign Up with GitHub',
      description: 'Quick OAuth authentication - no passwords, no credit card required',
    },
    {
      number: '2',
      title: 'Generate API Key',
      description: 'Get your KotaDB API key with tiered rate limits for your needs',
    },
    {
      number: '3',
      title: 'Connect via MCP',
      description: 'Paste config into Claude Code and unlock code intelligence for your agents',
    },
  ]

  return (
    <section className="py-16 px-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Get Started in 30 Seconds
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            From signup to enhanced AI agents in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              <div className="glass-light dark:glass-dark p-8 rounded-xl h-full">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                    {step.number}
                  </div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Arrow connector */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 text-3xl text-gray-400 dark:text-gray-600">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
