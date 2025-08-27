-- Matching Engine Database Schema
-- Purpose: Translation between OddsJam and Omenizer nomenclatures

-- 1. Sports mapping table
CREATE TABLE IF NOT EXISTS sports_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_sport VARCHAR(100) NOT NULL,
    omenizer_sport VARCHAR(100) NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_sport, omenizer_sport)
);

-- 2. Leagues mapping table  
CREATE TABLE IF NOT EXISTS leagues_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_league VARCHAR(200) NOT NULL,
    oddsjam_sport VARCHAR(100) NOT NULL,
    omenizer_league VARCHAR(200) NOT NULL,
    omenizer_sport VARCHAR(100) NOT NULL,
    country VARCHAR(100),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport)
);

-- 3. Teams mapping table
CREATE TABLE IF NOT EXISTS teams_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_team VARCHAR(255) NOT NULL,
    omenizer_team VARCHAR(255) NOT NULL,
    league VARCHAR(200),
    sport VARCHAR(100), 
    country VARCHAR(100),
    aliases TEXT[], -- Array of alternative names
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_team, omenizer_team)
);

-- 4. Bookmakers mapping table
CREATE TABLE IF NOT EXISTS bookmakers_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_bookmaker VARCHAR(200) NOT NULL,
    omenizer_bookmaker VARCHAR(200) NOT NULL,
    bookmaker_uuid UUID, -- For existing UUID system
    aliases TEXT[], -- Array of alternative names
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_bookmaker, omenizer_bookmaker)
);

-- 5. Countries mapping table
CREATE TABLE IF NOT EXISTS countries_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_country VARCHAR(100),
    omenizer_country VARCHAR(100) NOT NULL,
    iso_code_2 CHAR(2), -- ISO 3166-1 alpha-2
    iso_code_3 CHAR(3), -- ISO 3166-1 alpha-3
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_country, omenizer_country)
);

-- 6. Event matching table (stores successful matches)
CREATE TABLE IF NOT EXISTS event_matching (
    id SERIAL PRIMARY KEY,
    oddsjam_game_id VARCHAR(100) NOT NULL,
    omenizer_event_id UUID NOT NULL,
    match_score DECIMAL(3,2), -- How confident we are in this match
    matched_on TEXT[], -- What fields were used for matching
    event_datetime TIMESTAMP,
    sport VARCHAR(100),
    league VARCHAR(200),
    home_team VARCHAR(255),
    away_team VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_game_id, omenizer_event_id)
);

-- 7. Translation attempts log (for debugging and improvements)
CREATE TABLE IF NOT EXISTS translation_log (
    id SERIAL PRIMARY KEY,
    source_system VARCHAR(20) NOT NULL, -- 'oddsjam' or 'omenizer'
    translation_type VARCHAR(20) NOT NULL, -- 'sport', 'league', 'team', 'bookmaker', 'country'
    source_value VARCHAR(500) NOT NULL,
    target_value VARCHAR(500),
    success BOOLEAN NOT NULL,
    confidence_score DECIMAL(3,2),
    method_used VARCHAR(100), -- 'exact_match', 'fuzzy_match', 'manual', 'api_lookup'
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Unmatched items (items we couldn't translate)
CREATE TABLE IF NOT EXISTS unmatched_items (
    id SERIAL PRIMARY KEY,
    source_system VARCHAR(20) NOT NULL,
    item_type VARCHAR(20) NOT NULL, -- 'sport', 'league', 'team', 'bookmaker', 'country'
    item_value VARCHAR(500) NOT NULL,
    context JSONB, -- Additional context for matching (e.g., sport, league for team)
    attempt_count INTEGER DEFAULT 1,
    last_attempt TIMESTAMP DEFAULT NOW(),
    resolution_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_system, item_type, item_value)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sports_mapping_oddsjam ON sports_mapping(oddsjam_sport);
CREATE INDEX IF NOT EXISTS idx_leagues_mapping_oddsjam ON leagues_mapping(oddsjam_league, oddsjam_sport);
CREATE INDEX IF NOT EXISTS idx_teams_mapping_oddsjam ON teams_mapping(oddsjam_team);
CREATE INDEX IF NOT EXISTS idx_bookmakers_mapping_oddsjam ON bookmakers_mapping(oddsjam_bookmaker);
CREATE INDEX IF NOT EXISTS idx_countries_mapping_oddsjam ON countries_mapping(oddsjam_country);
CREATE INDEX IF NOT EXISTS idx_event_matching_game_id ON event_matching(oddsjam_game_id);
CREATE INDEX IF NOT EXISTS idx_translation_log_source ON translation_log(source_system, translation_type, created_at);
CREATE INDEX IF NOT EXISTS idx_unmatched_items_status ON unmatched_items(resolution_status, item_type);

-- Initial data population for known mappings
INSERT INTO sports_mapping (oddsjam_sport, omenizer_sport, confidence_score) VALUES
('BASEBALL', 'Baseball', 1.0),
('FOOTBALL', 'American Football', 1.0),
('TENNIS', 'Tennis', 1.0),
('SOCCER', 'Soccer', 1.0),
('MLB', 'Baseball', 0.9) -- MLB sometimes appears as sport in OddsJam
ON CONFLICT (oddsjam_sport, omenizer_sport) DO NOTHING;

INSERT INTO leagues_mapping (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, confidence_score) VALUES
('MLB', 'BASEBALL', 'Major League Baseball', 'Baseball', 1.0),
('NFL', 'FOOTBALL', 'National Football League', 'American Football', 1.0),
('NCAAF', 'FOOTBALL', 'NCAA Division I FBS', 'American Football', 1.0),
('ATP', 'TENNIS', 'ATP Tour', 'Tennis', 1.0)
ON CONFLICT (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport) DO NOTHING;

-- Known bookmaker mappings from existing UUID system
INSERT INTO bookmakers_mapping (oddsjam_bookmaker, omenizer_bookmaker, bookmaker_uuid, confidence_score) VALUES
('DraftKings', 'DraftKings', 'fe6bc0f8-e8a9-4083-9401-766d30817009', 1.0),
('FanDuel', 'FanDuel', 'd0f4c753-b2a3-4f02-ace3-f23d6987184a', 1.0),
('BetMGM', 'BetMGM', 'a4fb81f8-ba8c-4012-bd74-10f78846d6ea', 1.0),
('bet365', 'Bet365', 'ce996a90-c4bf-40b3-803f-daffe6c19b4f', 1.0),
('Pinnacle', 'Pinnacle', '41a3c468-e086-4dd5-883a-d740d802c629', 1.0)
ON CONFLICT (oddsjam_bookmaker, omenizer_bookmaker) DO NOTHING;

-- Common country mappings
INSERT INTO countries_mapping (oddsjam_country, omenizer_country, iso_code_2, iso_code_3, confidence_score) VALUES
('USA', 'United States', 'US', 'USA', 1.0),
('United States', 'United States', 'US', 'USA', 1.0),
('UK', 'United Kingdom', 'GB', 'GBR', 1.0),
('Canada', 'Canada', 'CA', 'CAN', 1.0),
('Australia', 'Australia', 'AU', 'AUS', 1.0),
('Austria', 'Austria', 'AT', 'AUT', 1.0)
ON CONFLICT (oddsjam_country, omenizer_country) DO NOTHING;

-- Triggers to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sports_mapping_updated_at BEFORE UPDATE ON sports_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leagues_mapping_updated_at BEFORE UPDATE ON leagues_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_mapping_updated_at BEFORE UPDATE ON teams_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookmakers_mapping_updated_at BEFORE UPDATE ON bookmakers_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_countries_mapping_updated_at BEFORE UPDATE ON countries_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_event_matching_updated_at BEFORE UPDATE ON event_matching FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_unmatched_items_updated_at BEFORE UPDATE ON unmatched_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();