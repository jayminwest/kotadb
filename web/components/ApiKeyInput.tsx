'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'

export default function ApiKeyInput() {
  const { apiKey, setApiKey, isAuthenticated } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const handleSave = () => {
    if (inputValue.trim()) {
      setApiKey(inputValue.trim())
      setInputValue('')
      setIsEditing(false)
    }
  }

  const handleClear = () => {
    setApiKey(null)
    setInputValue('')
    setIsEditing(false)
  }

  const handleCancel = () => {
    setInputValue('')
    setIsEditing(false)
  }

  if (!isEditing && !isAuthenticated) {
    return (
      <button
        onClick={() => setIsEditing(true)}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
      >
        Set API Key
      </button>
    )
  }

  if (!isEditing && isAuthenticated) {
    return (
      <div className="flex items-center space-x-2">
        <div className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-md text-sm font-medium">
          API Key Set
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          Edit
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
        >
          Clear
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <input
        type="password"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="kota_<tier>_<key_id>_<secret>"
        className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') handleCancel()
        }}
      />
      <button
        onClick={handleSave}
        disabled={!inputValue.trim()}
        className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
      >
        Save
      </button>
      <button
        onClick={handleCancel}
        className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        Cancel
      </button>
    </div>
  )
}
