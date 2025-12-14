-- Update existing API keys to match new rate limits from #423
-- Resolves #463: frontend displaying outdated rate limits

-- Update FREE tier: 100 -> 1000
UPDATE api_keys
SET rate_limit_per_hour = 1000
WHERE tier = 'free' AND rate_limit_per_hour = 100;

-- Update SOLO tier: 1000 -> 5000
UPDATE api_keys
SET rate_limit_per_hour = 5000
WHERE tier = 'solo' AND rate_limit_per_hour = 1000;

-- Update TEAM tier: 10000 -> 25000
UPDATE api_keys
SET rate_limit_per_hour = 25000
WHERE tier = 'team' AND rate_limit_per_hour = 10000;
