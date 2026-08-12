# Closira – AI Enquiry Pipeline & Dashboard 🤖📱

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi)
![React Native](https://img.shields.io/badge/React_Native-Expo_SDK_56-61DAFB?logo=react)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0%2B-red)

## 📝 Project Overview

**Closira** is a production-oriented, two-tier AI business assistant engineered for small and medium businesses (SMBs). It bridges high-throughput customer inquiry processing with real-time operational visibility. 

The system features an asynchronous Python backend that ingests customer messages, runs SOP keyword matching asynchronously, and immediately delivers job statuses to a React Native mobile dashboard equipped with AI-generated conversation summaries.

---

## 🛠️ System Architecture & Core Tech Stack

### 1. Asynchronous Backend (FastAPI & SQLAlchemy)
* **Framework:** Built with **FastAPI** for native async performance and minimal execution latency.
* **Non-Blocking Execution:** Leverages FastAPI `BackgroundTasks` to issue an instant `Job ID` upon request ingestion, decoupling the NLP engine from the primary thread.
* **Persistence:** **SQLAlchemy** ORM paired with **SQLite** for a lightweight, portable, and reliable relational data store.
* **Observability:** Custom JSON log formatter enforcing structured logging across inquiry lifecycles, SOP matches, and system escalations.

### 2. Frontend Dashboard (React Native & Expo SDK 56)
* **Framework:** Mobile application built using **React Native** and **Expo SDK 56**.
* **Navigation:** Stack-based routing via React Navigation, enabling seamless drill-down from lead feeds into detailed message threads.
* **Real-time UX:** Status badges, interactive filter views, and AI-driven conversation summarization for rapid decision-making.

---

## ⚙️ Engineering Trade-Offs & Key Decisions

* **BackgroundTasks vs. Celery/Redis:** To eliminate the infrastructure and memory overhead of running a dedicated Redis broker, the system utilizes native FastAPI `BackgroundTasks`. This satisfies non-blocking guarantees for standard SOP keyword matching while keeping the MVP lightweight and cost-effective.
* **Decoupled Main Thread:** API response times remain sub-millisecond as computation heavy tasks (summarization, SOP classification) are processed asynchronously.
* **Expo SDK 56 Resolution:** Adopted a standard `AppEntry` setup to resolve module boundary issues across web and mobile preview modes.

---

## 🚀 Setup and Installation

### Backend Setup
```bash
cd Backend
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
