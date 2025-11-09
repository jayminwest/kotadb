'use client'

interface ConfigurationDisplayProps {
  configuration: string
  showKey: boolean
  apiKey: string
}

export default function ConfigurationDisplay({ configuration, showKey, apiKey }: ConfigurationDisplayProps) {
  const displayConfig = showKey
    ? configuration
    : configuration.replace(apiKey, '●●●●●●●●●●●●●●●●●●●●')

  const highlightJSON = (json: string) => {
    // First, HTML-escape the entire JSON string to prevent XSS
    const escaped = json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    // Then apply syntax highlighting to the escaped content
    return escaped
      .replace(/(&quot;(?:[^&]|&(?!quot;))*&quot;)\s*:/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>:')
      .replace(/:\s*(&quot;(?:[^&]|&(?!quot;))*&quot;)/g, ': <span class="text-green-600 dark:text-green-400">$1</span>')
      .replace(/:\s*(true|false|null)/g, ': <span class="text-purple-600 dark:text-purple-400">$1</span>')
      .replace(/:\s*(\d+)/g, ': <span class="text-orange-600 dark:text-orange-400">$1</span>')
  }

  return (
    <div className="relative">
      <div className="glass-light dark:glass-dark rounded-md overflow-hidden">
        <pre className="overflow-x-auto p-4 text-sm">
          <code
            className="text-gray-800 dark:text-gray-200 font-mono"
            dangerouslySetInnerHTML={{ __html: highlightJSON(displayConfig) }}
          />
        </pre>
      </div>
      <div className="absolute top-2 right-2">
        <span className="px-2 py-1 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
          JSON
        </span>
      </div>
    </div>
  )
}
