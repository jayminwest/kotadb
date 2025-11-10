export default function FeatureShowcase() {
  const features = [
    {
      title: 'Code Search',
      description: 'Fast semantic search across all your indexed repositories with context-aware snippets',
      icon: '🔍',
    },
    {
      title: 'Dependency Analysis',
      description: 'Understand file relationships and impact with deep dependency graph traversal',
      icon: '🔗',
    },
    {
      title: 'Change Impact',
      description: 'Validate changes before implementation with comprehensive impact analysis',
      icon: '⚡',
    },
    {
      title: 'MCP Integration',
      description: 'Seamless integration with Claude Code via Model Context Protocol',
      icon: '🔌',
    },
  ]

  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">
            Powerful Code Intelligence
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Everything you need to make AI agents understand your codebase
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="glass-light dark:glass-dark p-6 rounded-xl hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
