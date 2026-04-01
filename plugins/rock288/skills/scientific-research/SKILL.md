---
name: rk:scientific-research
description: "Research science, engineering, finance, and data analysis topics. Structured methodology with literature review, analysis, and synthesis. Use for technical research and deep analysis."
argument-hint: "[research question or topic]"
---

# Scientific Research

Structured research methodology for science, engineering, finance, and data analysis.

## Workflow

### Step 1: Define Research Question

Clarify:
1. **Topic** — What exactly are we researching?
2. **Scope** — How deep? Survey, analysis, or implementation?
3. **Output** — Report, code implementation, or recommendation?
4. **Constraints** — Time, tech stack, data availability?

### Step 2: Literature Review

Search and synthesize from multiple sources:

| Source | Method |
|--------|--------|
| Academic papers | Search via web for key terms |
| Documentation | Official docs of relevant tools/libraries |
| Code examples | GitHub repos, tutorials, implementations |
| Data sources | Public datasets, APIs, benchmarks |

For each source, capture:
- Key findings
- Methodology used
- Limitations
- Relevance to our question

### Step 3: Analysis

Depending on the topic:

**For Science/Engineering:**
- Identify variables and relationships
- Evaluate methodologies (pros/cons/tradeoffs)
- Compare approaches with evidence
- Note assumptions and limitations

**For Finance:**
- Data collection and cleaning approach
- Statistical methods (regression, time series, Monte Carlo)
- Risk metrics (VaR, Sharpe, drawdown)
- Backtesting methodology

**For Data Analysis:**
- Data pipeline design
- Feature engineering considerations
- Model selection criteria
- Validation strategy

### Step 4: Synthesis

Combine findings into a structured report:

```
## Research Report: [Topic]

### Executive Summary
[2-3 sentence overview of findings]

### Background
[Context and why this matters]

### Methodology
[How we approached the research]

### Findings
1. [Finding with evidence]
2. [Finding with evidence]
3. [Finding with evidence]

### Analysis
[Deeper interpretation of findings]

### Recommendations
1. [Actionable recommendation]
2. [Actionable recommendation]

### Limitations
- [What we couldn't verify]
- [Assumptions made]

### References
- [Source 1]
- [Source 2]
```

### Step 5: Implementation (if requested)

If the research leads to code:
1. Prototype the approach
2. Include proper citations/comments
3. Add tests validating the methodology
4. Document assumptions in code

## Domains

| Domain | Key Libraries/Tools |
|--------|-------------------|
| Data Science | pandas, numpy, scipy, scikit-learn |
| Machine Learning | PyTorch, TensorFlow, Hugging Face |
| Finance | quantlib, zipline, pandas-ta |
| Statistics | statsmodels, R via rpy2 |
| Visualization | matplotlib, plotly, d3.js |
| Engineering | MATLAB/Octave, FEniCS, OpenFOAM |
