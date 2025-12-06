export default function FeatureShowcase() {
	const features = [
		{
			title: "Instant Code Search",
			description:
				"Your AI finds exactly what it needs in milliseconds—no more expensive file-by-file reading that burns through tokens and context windows",
			icon: "🔍",
		},
		{
			title: "Dependency Mapping",
			description:
				"Know what breaks before changing anything. Your AI sees the full picture of how files connect, preventing breaking changes",
			icon: "🔗",
		},
		{
			title: "Change Impact Analysis",
			description:
				"Validate changes before your AI writes them. Catch architectural conflicts and missing test coverage automatically",
			icon: "⚡",
		},
		{
			title: "Works with Claude Code",
			description:
				"Drop in your API key and Claude Code gains instant access to your entire codebase structure—zero config, maximum intelligence",
			icon: "🔌",
		},
	];

	return (
		<section className="py-16 px-4">
			<div className="max-w-6xl mx-auto">
				<div className="text-center mb-12">
					<h2 className="text-4xl font-bold mb-4">
						Everything Your AI Needs to Stop Hallucinating
					</h2>
					<p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
						Real code intelligence—not just embedding search
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
	);
}
