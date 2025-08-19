-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) UNIQUE NOT NULL,
  sport VARCHAR(100) NOT NULL,
  league VARCHAR(100),
  bet_type VARCHAR(100), -- e.g., 'Moneyline', 'Spread', 'Total'
  market_info VARCHAR(255), -- Additional market context
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_rotation VARCHAR(50),
  away_rotation VARCHAR(50),
  start_time VARCHAR(100),
  start_time_parsed TIMESTAMPTZ, -- Parsed datetime when available
  game_status VARCHAR(50), -- e.g., 'scheduled', 'live', 'final'
  inning_info VARCHAR(50), -- For live games: '7 Top', '3 Bottom', etc.
  game_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create odds table
CREATE TABLE IF NOT EXISTS odds (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL REFERENCES games(game_id),
  sportsbook VARCHAR(100) NOT NULL,
  home_odds INTEGER,
  away_odds INTEGER,
  home_odds_percent DECIMAL(5,2),
  away_odds_percent DECIMAL(5,2),
  odds_format VARCHAR(20), -- 'american', 'percentage', 'decimal', etc.
  best_home_odds INTEGER, -- Best available odds for home team at time of scraping
  best_away_odds INTEGER, -- Best available odds for away team at time of scraping
  avg_home_odds INTEGER, -- Average odds for home team at time of scraping
  avg_away_odds INTEGER, -- Average odds for away team at time of scraping
  timestamp TIMESTAMPTZ NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, sportsbook)
);

-- Create odds history table for tracking changes
CREATE TABLE IF NOT EXISTS odds_history (
  id BIGSERIAL PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL,
  sportsbook VARCHAR(100) NOT NULL,
  home_odds INTEGER,
  away_odds INTEGER,
  home_odds_percent DECIMAL(5,2),
  away_odds_percent DECIMAL(5,2),
  previous_home_odds INTEGER,
  previous_away_odds INTEGER,
  previous_home_odds_percent DECIMAL(5,2),
  previous_away_odds_percent DECIMAL(5,2),
  odds_format VARCHAR(20),
  best_home_odds INTEGER, -- Best available odds for home team at time of scraping
  best_away_odds INTEGER, -- Best available odds for away team at time of scraping
  avg_home_odds INTEGER, -- Average odds for home team at time of scraping
  avg_away_odds INTEGER, -- Average odds for away team at time of scraping
  timestamp TIMESTAMPTZ NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_games_game_id ON games(game_id);
CREATE INDEX idx_games_sport_league ON games(sport, league);
CREATE INDEX idx_games_start_time ON games(start_time);

CREATE INDEX idx_odds_game_id ON odds(game_id);
CREATE INDEX idx_odds_sportsbook ON odds(sportsbook);
CREATE INDEX idx_odds_timestamp ON odds(timestamp);

CREATE INDEX idx_odds_history_game_id ON odds_history(game_id);
CREATE INDEX idx_odds_history_timestamp ON odds_history(timestamp);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds ENABLE ROW LEVEL SECURITY;
ALTER TABLE odds_history ENABLE ROW LEVEL SECURITY;

-- Create policies for anonymous access (for development)
CREATE POLICY "Enable read access for all users" ON games
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON games
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON games
    FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON odds
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON odds
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON odds
    FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON odds_history
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON odds_history
    FOR INSERT WITH CHECK (true);