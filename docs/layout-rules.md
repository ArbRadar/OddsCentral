# Layout Rules and Selector Configurations

## Always Ask Before Debugging
**IMPORTANT**: Always ask the user for layout information and verification instead of making assumptions about HTML structure. The user can see the actual page and provide HTML snippets.

## Platform Configurations

### OddsJam (oddsjam.com)

#### Sportsbook View - Soccer 3-way Markets
**Team Cell Structure**:
```html
<div class="team-cell">
  <div class="box-border"> <!-- Home Team -->
    <p>Team Name</p>
  </div>
  <div class="box-border"> <!-- Draw Outcome -->
    <p>Draw</p>
  </div>
  <div class="box-border"> <!-- Away Team -->
    <p>Team Name</p>
  </div>
</div>
```

**Team Extraction Rules**:
- For 3-way soccer markets: Use teams[0] as home, teams[2] as away, skip teams[1] ("Draw")
- For 2-way markets: Use teams[0] as home, teams[1] as away

#### Sportsbook View - MLB/NFL 2-way Markets  
**Team Cell Structure**:
```html
<div class="team-cell">
  <div class="box-border"> <!-- Home Team -->
    <p>Team Name</p>
  </div>
  <div class="box-border"> <!-- Away Team -->
    <p>Team Name</p>
  </div>
</div>
```

**Team Extraction Rules**:
- Use teams[0] as home, teams[1] as away

## Sport Detection Rules

### Primary Method: League Selector
**Selector**: `input[role="combobox"]` or `input[id*="combobox-input"]`
**Location**: League/Sport dropdown selector on the page
**Method**: Extract text from `value` or `placeholder` attribute

#### League to Sport Mapping:
**Soccer (3 outcomes)** - Comprehensive list from dropdown:
- UEFA/FIFA: Champions League, Europa League, European Championship, World Cup, Copa America, etc.
- Argentina: Copa Argentina, Primera Division, Primera Nacional
- Europe: Premier League, Bundesliga, La Liga, Serie A/B/C, Ligue 1/2, Eredivisie, etc.
- Americas: MLS, Liga MX, Brazilian leagues, Copa Brasil, etc.
- Asia/Africa: J League, K League, Super League (various countries), etc.
- All entries containing: "soccer", "football", "copa", "liga", "primera", "division"

**Baseball (2 outcomes)**:
- MLB, World Baseball Classic, KBO, NPB, CPBL

**Basketball (2 outcomes)**:
- NBA, WNBA, Euroleague, FIBA competitions, NCAA

**Other Sports (2 outcomes)**:
- Boxing, MMA, UFC, Tennis, Golf, Cricket, Hockey, etc.

### Fallback Method: URL Detection
Only used if league selector is not found or doesn't match known patterns.

### Market Type Detection
- 3-way markets: SOCCER (Home/Draw/Away)
- 2-way markets: MLB, NFL, NBA (Home/Away)