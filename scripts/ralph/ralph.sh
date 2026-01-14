#!/bin/bash
# Ralph - Autonomous Agent Loop
# Runs OpenCode iterations until all PRD stories are complete

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RALPH_DIR="$SCRIPT_DIR"
PRD_FILE="$RALPH_DIR/prd.json"
PROGRESS_FILE="$RALPH_DIR/progress.txt"
PROMPT_FILE="$RALPH_DIR/prompt.md"

MAX_ITERATIONS=${1:-50}
ITERATION=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Ralph - Autonomous Agent Loop${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check prerequisites
if [ ! -f "$PRD_FILE" ]; then
    echo -e "${RED}Error: prd.json not found at $PRD_FILE${NC}"
    exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
    echo -e "${RED}Error: prompt.md not found at $PROMPT_FILE${NC}"
    exit 1
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "# Auto-generated - append learnings and context here" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
    echo "## Session Started: $(date)" >> "$PROGRESS_FILE"
    echo "" >> "$PROGRESS_FILE"
fi

# Function to check if all stories pass
check_complete() {
    # Use node to parse JSON and check if all stories pass
    node -e "
        const prd = require('$PRD_FILE');
        const allPass = prd.userStories.every(s => s.passes === true);
        const total = prd.userStories.length;
        const passed = prd.userStories.filter(s => s.passes).length;
        console.log(JSON.stringify({allPass, total, passed}));
    " 2>/dev/null || echo '{"allPass":false,"total":0,"passed":0}'
}

# Function to get next pending story
get_next_story() {
    node -e "
        const prd = require('$PRD_FILE');
        const next = prd.userStories.find(s => !s.passes);
        if (next) {
            console.log(JSON.stringify({id: next.id, title: next.title}));
        } else {
            console.log('null');
        }
    " 2>/dev/null || echo 'null'
}

echo -e "${YELLOW}Starting Ralph loop (max $MAX_ITERATIONS iterations)${NC}"
echo ""

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
    ITERATION=$((ITERATION + 1))
    
    # Check current status
    STATUS=$(check_complete)
    ALL_PASS=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).allPass)" 2>/dev/null || echo "false")
    TOTAL=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).total)" 2>/dev/null || echo "0")
    PASSED=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).passed)" 2>/dev/null || echo "0")
    
    echo -e "${BLUE}----------------------------------------${NC}"
    echo -e "${BLUE}Iteration $ITERATION / $MAX_ITERATIONS${NC}"
    echo -e "${BLUE}Progress: $PASSED / $TOTAL stories complete${NC}"
    echo -e "${BLUE}----------------------------------------${NC}"
    
    # Check if complete
    if [ "$ALL_PASS" = "true" ]; then
        echo ""
        echo -e "${GREEN}======================================${NC}"
        echo -e "${GREEN}  COMPLETE! All stories pass.${NC}"
        echo -e "${GREEN}======================================${NC}"
        echo ""
        echo "## Session Complete: $(date)" >> "$PROGRESS_FILE"
        echo "All $TOTAL stories completed successfully." >> "$PROGRESS_FILE"
        exit 0
    fi
    
    # Get next story
    NEXT_STORY=$(get_next_story)
    if [ "$NEXT_STORY" = "null" ]; then
        echo -e "${RED}Error: No pending stories but not all pass?${NC}"
        exit 1
    fi
    
    STORY_ID=$(echo "$NEXT_STORY" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).id)" 2>/dev/null)
    STORY_TITLE=$(echo "$NEXT_STORY" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).title)" 2>/dev/null)
    
    echo -e "${YELLOW}Working on: $STORY_ID - $STORY_TITLE${NC}"
    echo ""
    
    # Log iteration start
    echo "" >> "$PROGRESS_FILE"
    echo "### Iteration $ITERATION - $(date)" >> "$PROGRESS_FILE"
    echo "Working on: $STORY_ID - $STORY_TITLE" >> "$PROGRESS_FILE"
    
    # Run OpenCode with the prompt
    # Note: This assumes 'opencode' CLI is available
    # Adjust the command based on your setup
    cd "$PROJECT_ROOT"
    
    # Create a temporary prompt with current context
    TEMP_PROMPT=$(mktemp)
    cat "$PROMPT_FILE" > "$TEMP_PROMPT"
    echo "" >> "$TEMP_PROMPT"
    echo "## Current Story" >> "$TEMP_PROMPT"
    echo "You are working on: **$STORY_ID - $STORY_TITLE**" >> "$TEMP_PROMPT"
    
    # Run OpenCode (or amp, depending on your setup)
    # Using opencode with the prompt file
    if command -v opencode &> /dev/null; then
        opencode --prompt "$(cat $TEMP_PROMPT)" --yes 2>&1 | tee -a "$PROGRESS_FILE"
    elif command -v amp &> /dev/null; then
        amp --prompt "$(cat $TEMP_PROMPT)" --yes 2>&1 | tee -a "$PROGRESS_FILE"
    else
        echo -e "${RED}Error: Neither 'opencode' nor 'amp' CLI found${NC}"
        echo "Please install OpenCode or Amp CLI"
        rm "$TEMP_PROMPT"
        exit 1
    fi
    
    rm "$TEMP_PROMPT"
    
    echo "" >> "$PROGRESS_FILE"
    echo "Iteration $ITERATION completed at $(date)" >> "$PROGRESS_FILE"
    
    # Small delay between iterations
    sleep 2
done

echo ""
echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}  Max iterations ($MAX_ITERATIONS) reached${NC}"
echo -e "${YELLOW}======================================${NC}"
echo ""

STATUS=$(check_complete)
PASSED=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).passed)" 2>/dev/null || echo "0")
TOTAL=$(echo "$STATUS" | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).total)" 2>/dev/null || echo "0")

echo "Final progress: $PASSED / $TOTAL stories complete"
echo "" >> "$PROGRESS_FILE"
echo "## Session Ended (max iterations): $(date)" >> "$PROGRESS_FILE"
echo "Final progress: $PASSED / $TOTAL stories complete" >> "$PROGRESS_FILE"
