'use client'

import { useState, FormEvent } from 'react'

interface SearchBarProps {
  onSearch: (term: string) => void
  isLoading?: boolean
  placeholder?: string
}

export default function SearchBar({
  onSearch,
  isLoading = false,
  placeholder = 'Search code...',
}: SearchBarProps) {
  const [term, setTerm] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (term.trim()) {
      onSearch(term.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex space-x-2">
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg text-base bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!term.trim() || isLoading}
          className="px-6 py-3 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        {term.trim().length > 0 && term.trim().length < 3 && (
          <span className="text-yellow-600 dark:text-yellow-400">
            Search term should be at least 3 characters
          </span>
        )}
      </div>
    </form>
  )
}
