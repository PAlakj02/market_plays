**PROJECT PROPOSAL**

**MarketMinds: A Machine Learning Stock-Prediction Platform & Financial Literacy Program for Indian Students**

*Prepared for undergraduate admissions — Computer Science (Major) / Finance (Minor)*

# **1\. Concept Overview**

MarketMinds is a web application that teaches financial literacy to students by combining machine learning with 25 years of real market history, rather than teaching it as a set of theoretical rules. Students are given virtual "token money" — no real currency at any point — and use it to build a simulated portfolio inside a market environment reconstructed from real historical data.

As they interact, the platform replays real events in real time against their token balance: what a 2008-style downturn does to an unbalanced portfolio, how gold historically rises as a safe-haven asset during a crisis, and — as the central case study — exactly what happened to a portfolio during the 2020 COVID-19 crash, day by day. A student doesn't read that "diversification reduces risk" — they watch their own simulated money drop 30% because it was concentrated in one sector, then watch a diversified version of the same portfolio hold up better, using the same real data. The ML layer both powers this historical replay engine and generates short-term forecasts that are shown alongside the real outcome, so students can also see where prediction succeeds and where it fails.

This is deliberately experiential rather than theoretical: the finance concepts (risk, diversification, volatility, safe-haven assets, compounding) are the same ones taught in any personal-finance curriculum, but here they are learned by watching consequences unfold on a timeline the student controls, using events like COVID that are recent enough to feel real rather than abstract.

# **2\. Data: Sources and Duration**

## **2.1 Duration**

The platform is built on approximately 25 years of historical data (c. 2000–2025), which is enough history to include multiple full market cycles: the 2008 global financial crisis, the 2020 COVID-19 crash, several gold price surges during periods of instability, and normal steady-growth periods for contrast.

## **2.2 Sources**

* Equities and indices: NIFTY 50, SENSEX, and a basket of individual NSE-listed stocks, pulled via the yfinance library (Yahoo Finance data, using the .NS ticker suffix for NSE symbols) — free, no API key required, and reliable enough for a project at this scale.

* Baseline historical datasets: pre-compiled NIFTY 50 / NSE datasets from Kaggle, used to bootstrap the 25-year history quickly rather than scripting two decades of requests from scratch.

* Official verification: NSE's own historical bhavcopy archives, used selectively to spot-check and validate the Kaggle/yfinance data for accuracy.

* Gold and commodities: historical gold price data (MCX/World Gold Council series) to power the "gold as safe haven" module.

* Macro context: India VIX and major event dates (crash start/recovery dates, RBI rate changes) used to label and annotate the timeline the student sees.

## **2.3 Scale**

Twenty-five years of daily data across multiple indices, a basket of individual stocks, and gold prices works out to several hundred thousand individual data points once cleaned and feature-engineered — a genuinely large dataset for a student project, and a concrete, honest number to cite when describing the technical scope of the work.

# **3\. How It Will Be Built**

## **3.1 Tools and Stack**

| Layer | Tools |
| :---- | :---- |
| Frontend / Website | Next.js (React) \+ Tailwind CSS, deployed on Vercel |
| Data processing | Python — pandas, NumPy — for cleaning and feature engineering across the 25-year dataset |
| Machine learning | scikit-learn, statsmodels, PyTorch (for sequence models) |
| Backend / accounts & token balances | Supabase (Postgres \+ auth) — stores each student's virtual portfolio and progress |
| Version control | GitHub, with a public repo showing real commit history over time |
| Analytics | Vercel Analytics / Plausible — tracks active users and engagement from day one |

## **3.2 Machine Learning Models**

* Baseline models — linear regression and ARIMA — to establish an explainable benchmark before adding complexity.

* Tree-based models — Random Forest and XGBoost — using engineered technical indicators (moving averages, RSI, MACD, volatility bands) for short-term forecasting.

* Sequence models — an LSTM/GRU network trained on the full 25-year series, to capture longer-term time dependence and to compare performance across different market regimes.

* Regime detection — a simpler classification/clustering approach (e.g., k-means or a hidden Markov model on volatility and return features) to automatically label periods as "stable," "volatile," or "crash," which is what drives which historical scenario gets replayed to the student.

* Honest evaluation throughout: the COVID and 2008 windows are used specifically to show where forecasts break down under regime change, not to claim predictive power over crashes — this is a stronger, more credible technical finding than a claim of high accuracy.

# **4\. Future Scope**

The long-term direction for MarketMinds is to move from a personal project into a program with real institutional reach:

* School partnerships: running the platform as a structured module in school computer or economics classes, starting with 1–2 local schools and expanding based on outcomes.

* Government collaboration: aligning with and, longer term, seeking to collaborate with Indian government financial literacy initiatives — such as SEBI's investor awareness programs and RBI's financial literacy campaigns — to plug into infrastructure and credibility that already exists rather than building awareness from zero.

* Regional language support: translating core modules so the platform is accessible beyond English-medium schools, which matters directly for reaching the students most underserved by existing financial literacy resources.

* Curriculum certification: working toward the platform being recognized as a supplementary resource by state education boards, giving it a durable distribution channel beyond word-of-mouth.

# **5\. Presenting This to Admissions Officers**

The application should lead with evidence, not intentions. Three numbers matter most, and the platform is designed to produce all three honestly:

* Active users: real signups and, more importantly, returning/active users — a small number of students who came back and completed modules says more than a large number who visited once.

* Scale of data processed: the 25-year, multi-asset dataset (equities, indices, gold) gives a genuine, specific technical scale to point to — several hundred thousand cleaned and feature-engineered data points — rather than a vague claim of "big data."

* A live subscription model: even a modest annual subscription tier (see below) demonstrates product thinking and sustainability, which reads as more mature than a project framed purely as a school assignment.

Alongside the numbers, a one-page reflection on what the data and models actually showed — including where the models failed during crash periods — demonstrates the kind of honest, analytical thinking admissions officers are trying to identify in a CS+Finance applicant.

# **6\. Competitive Landscape**

The closest existing products, compared on the features that matter most, plus what specifically separates MarketMinds from each:

| Competitor | Crash Replay | ML Forecasting | India-Focused | How MarketMinds Differs |
| :---- | :---- | :---- | :---- | :---- |
| NSE Paathshala | No | No | Yes | Adds historical crash replay and ML analysis to what is otherwise live-price practice trading only |
| StockPe | No | No | Yes | Adds a 25-year data backbone and ML layer; StockPe is a live fantasy-trading app, not a teaching tool |
| Stock-Trak / PersonalFinanceLab | No | No | No (global) | Adds India-specific context and event-based learning vs. their generic, broker-style simulation |
| The Stock Market Game | No | No | No (US) | Uses ML to explain \*why\* markets moved, not just track a live portfolio score |
| KidVestors | No | No | No (global) | Focused on one deep case study (COVID/crashes) rather than broad general trading practice |
| Saa₹thi 2.0 (SEBI) | No | No | Yes (govt.) | Turns SEBI's static content model into an interactive, consequence-based experience |
| Moneybhai (Moneycontrol) | No | No | Yes | Adds crash-focused learning and ML analysis to what is otherwise a live-price trading game with brokerage/STT simulation |
| StockGro | No | No | Yes | Replaces campus leaderboard competition with a structured, event-based literacy curriculum |
| TradingLeagues | No | No | Yes | Built for teaching outcomes, not fantasy-league competition across stocks/crypto |

# **7\. Subscription Plan**

A freemium structure keeps the user-growth numbers strong while still demonstrating a real business model:

* Free tier: full access to the token-money simulator, the COVID and 2008 replay modules, and core literacy lessons — this is what drives the active-user numbers worth showing an officer.

* Paid tier (annual subscription, modest price point): additional scenarios (e.g., extended gold/commodity modules, more advanced ML-driven forecasting dashboards), downloadable progress reports for parents, and classroom/teacher accounts for schools running the platform as a group activity.

Framing note: prioritize free-tier growth over subscription revenue when deciding what to optimize for in the first month — a modest number of paying users is a good signal, but a larger free active-user base is the stronger number to lead with.

# **8\. Week-by-Week Roadmap**

| Week | Focus | Milestone |
| :---- | :---- | :---- |
| Week 1 | Build sprint | Live MVP website: one trained model, COVID case-study replay, token-money simulator, 2 literacy lessons |
| Week 2 | Warm launch \+ first workshop | First real users from personal network; one in-person school/class workshop run |
| Week 3 | Wider outreach | Public content push (student communities, finance clubs); active-user count roughly doubles |
| Week 4 | Second partnership \+ write-up | Second workshop or school partnership secured; 1-page reflection written using real usage data |

