# Dynamic Microloan Repayment & Cash-Flow Planning (MicroLoan Manager)

A financial intelligence platform designed to differentiate between **seasonal income stress** and **genuine financial decline** in microloan borrowers. It analyzes cash flows using STL decomposition, forecasts future liquidity, auto-classifies risk profiles, and generates restructured repayment schedules with clear, plain-language explanations.

---

## 🌟 Key Features

1. **STL Decomposition (Seasonality vs Trend Separation)**
   - Deconstructs borrower cash-flow history into **Trend** (long-term direction), **Seasonal** (annual repeating patterns), and **Residual** (noise).
   - Identifies predictable seasonal dips without incorrectly flagging borrowers as defaulting.

2. **Cash Flow Forecasting & Liquidity Buffer**
   - Projects 6-month net cash flows using seasonal-naive extrapolation and linear trend modeling.
   - Calculates projected cumulative liquidity buffer vs. loan obligations.

3. **Automated Risk Classification**
   - Classifies borrowers into 3 archetypes:
     - `healthy`: Consistent positive cash flow & upward trend.
     - `seasonal_stress`: Severe seasonal dip, but positive long-term trend & recovery expected.
     - `genuine_decline`: Persistent structural downward trend requiring active intervention.

4. **Dynamic Repayment Restructuring**
   - Generates tailored restructured repayment plans:
     - Moratorium / deferred payments during low-income seasonal months.
     - Tenure extensions and adjusted monthly installments for declining cash flows.

5. **Plain-Language Explanations & Pros/Cons**
   - Auto-generates human-readable explanations, risk flags, and machine-generated pros/cons lists for credit managers.

6. **Modern React (Vite) Dashboard & FastAPI Backend**
   - **React (Vite) Dashboard**: Retractable sidebar with 3-line toggle button, orange-yellow brand header, interactive Recharts charts, and tabbed view navigation.
   - **FastAPI REST Service**: Real-time REST API backend powering all data analysis and restructuring calculations.

---

## 👥 Borrower Archetypes

| Borrower ID | Name | Archetype | Ground Truth Status | Key Cash Flow Characteristics |
|-------------|------|-----------|--------------------|--------------------------------|
| `B001` | **Ravi Kumar** | Farmer | `seasonal_stress` | High harvest income in winter/spring, predictable zero/low income during monsoons. |
| `B002` | **Meena Devi** | Vendor | `healthy` | Steady daily sales with mild festival surges, strong cash-flow buffer. |
| `B003` | **Arjun Singh** | Laborer | `genuine_decline` | Structural drop in weekly work days, downward income trend over 12+ months. |

---

## 🚀 Quick Start & Setup

### Prerequisites
- **Python**: 3.11 (required — scipy/prophet/statsmodels do not have wheels for Python 3.13)
- **Node.js**: v18+ and `npm`
- **Homebrew**: for installing Python 3.11 on macOS

### 1. Install Python 3.11

```bash
brew install python@3.11
```

### 2. Create Virtual Environment & Install Python Dependencies

```bash
cd ~/Desktop/techtatva-main
rm -rf .venv
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies

```bash
cd app/frontend
npm install
cd ../..
```

---

## 💻 Running the Application

Open **two terminal tabs** and run each service separately.

### Terminal 1 — FastAPI Backend

```bash
cd ~/Desktop/techtatva-main
source .venv/bin/activate
python3 -m uvicorn app.api:app --host 0.0.0.0 --port 8000
```

Wait until you see `Application startup complete.`

### Terminal 2 — React Frontend

```bash
cd ~/Desktop/techtatva-main/app/frontend
npm run dev
```

Then open **[http://localhost:5173](http://localhost:5173)** in your browser.

| Service | URL |
|---------|-----|
| React Dashboard | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

> **Note:** Do not use `--reload` with uvicorn — it causes an infinite restart loop by watching `.venv` package files.

---

## 📁 Project Structure

```
ttatva/
├── app/
│   ├── api.py               # FastAPI backend endpoints (/api/borrowers, /api/borrowers/{id})
│   ├── analysis.py          # STL decomposition, 6-month forecasting, & classification logic
│   ├── restructuring.py     # Repayment schedule recalculation engine
│   ├── explain.py           # Natural language explanation & pros/cons generator
│   ├── data_generator.py    # Synthetic 2-year weekly transaction history generator
│   ├── data/
│   │   ├── borrowers.csv    # Borrower metadata & loan parameters
│   │   └── transactions.csv # Weekly transaction logs
│   └── frontend/
│       ├── src/
│       │   ├── App.jsx                 # Main React container with retractable sidebar & orange header
│       │   ├── components/
│       │   │   ├── BorrowerPage.jsx    # Borrower details view & navigation tabs
│       │   │   ├── SummarySection.jsx  # Key KPI metric cards & Pros/Cons breakdown
│       │   │   ├── ChartsSection.jsx   # Cash flow, STL decomposition, & Forecast charts
│       │   │   ├── RepaymentSection.jsx# Original vs Proposed repayment schedule comparison
│       │   │   └── ExplanationSection.jsx# Plain-language risk explanation cards
│       │   ├── hooks/
│       │   │   └── useApi.js           # Custom React hooks for API data fetching
│       │   ├── main.jsx                # React app entry point
│       │   └── index.css               # Global CSS design tokens
│       ├── package.json                # Frontend dependencies
│       └── vite.config.js              # Vite build configuration
├── start.sh                 # One-click startup script for FastAPI + React
├── check_data.py            # Data validation script
├── validate_analysis.py     # Analysis pipeline validation test
├── validate_full.py         # End-to-end integration test
├── requirements.txt         # Python dependencies
└── README.md                # Project documentation
```

---

## 💡 Key Algorithmic Insight

> **Seasonal income dips repeat at predictable times every year without long-term structural decay.**
> Genuine financial deterioration displays a continuous downward trend that fails to recover post-season. By leveraging **STL decomposition**, the system decouples seasonal variance from structural trend prior to evaluation, preventing unwarranted defaults on seasonal earners.

---

## 🌐 Impact Alignment

Aligned with **United Nations Sustainable Development Goal 8 (Decent Work and Economic Growth)**. By preventing improper loan defaults during predictable seasonal lulls, the system helps lenders maintain credit access for vulnerable micro-entrepreneurs while safeguarding portfolio performance.
