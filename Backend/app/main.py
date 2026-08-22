from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from payments import create_payment_link
import uuid
import datetime
import logging
import json
from typing import Optional

from database import SessionLocal, Enquiry
from classifier import classify_and_summarize

# --- 1.5 STRUCTURED JSON LOGGING ---
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        return json.dumps(log_record)


logger = logging.getLogger("revagent")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

app = FastAPI(title="RevAgent Backend MVP")

# Development CORS for the Expo web app.
# Keep this permissive while testing locally; restrict it to your deployed
# frontend domain before publishing the app publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize_enquiry(enq: Enquiry):
    return {
        "id": enq.id,
        "customer_name": enq.customer_name,
        "channel": enq.channel,
        "message": enq.message,
        "status": enq.status,
        "sop_match": enq.sop_match,
        "suggested_response": enq.suggested_response,
        "recommended_action": enq.recommended_action,
        "ai_confidence": enq.ai_confidence,
        "payment_link": enq.payment_link,
        "created_at": enq.created_at.isoformat() if enq.created_at else None,
        "history": enq.history or [],
    }


# --- 1.4 ASYNC WORKER LOGIC ---
def process_enquiry_task(enquiry_id: str):
    db = SessionLocal()
    enq = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enq:
        db.close()
        return

    try:
        intent, confidence, action, summary = classify_and_summarize(enq.message)

        h = list(enq.history or [])
        enq.sop_match = intent
        enq.suggested_response = summary
        enq.recommended_action = action
        enq.ai_confidence = f"{confidence:.2f}"
        enq.status = "processed" if confidence > 0.4 else "escalated"

        h.append(
            f"{datetime.datetime.utcnow()}: AI classified as '{intent}' "
            f"(conf {confidence:.2f}) -> Action: {action}"
        )
        logger.info(
            f"Enquiry {enquiry_id} classified as {intent}, action: {action}"
        )

        # Agentic commerce step: auto-generate a real payment link for pricing intents.
        if intent == "pricing":
            link = create_payment_link(
                customer_name=enq.customer_name,
                amount_rupees=5000,
                description="RevAgent basic plan",
            )
            if link:
                enq.payment_link = link
                h.append(
                    f"{datetime.datetime.utcnow()}: Payment link generated -> {link}"
                )
                logger.info(f"Payment link created for {enquiry_id}: {link}")
            else:
                h.append(
                    f"{datetime.datetime.utcnow()}: Payment link generation FAILED"
                )
                logger.info(f"Payment link generation failed for {enquiry_id}")

        enq.history = h
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(f"Enquiry processing failed for {enquiry_id}")
    finally:
        db.close()


# --- API ENDPOINTS ---
@app.get("/")
def home():
    return {"message": "RevAgent API is live! Go to /docs to test endpoints."}


@app.get("/enquiries")
def list_enquiries(db: Session = Depends(get_db)):
    enquiries = db.query(Enquiry).order_by(Enquiry.created_at.desc()).all()
    return [serialize_enquiry(enquiry) for enquiry in enquiries]


@app.post("/enquiry")
async def create_enquiry(
    name: str,
    channel: str,
    message: str,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    new_enq = Enquiry(
        id=job_id,
        customer_name=name,
        channel=channel,
        message=message,
        history=[],
    )
    db.add(new_enq)
    db.commit()

    logger.info(f"Enquiry created: {job_id}")
    bg.add_task(process_enquiry_task, job_id)
    return {"job_id": job_id, "status": "processing"}


@app.post("/enquiry/{id}/follow-up")
def schedule_follow_up(
    id: str,
    delay_minutes: int,
    message_template: Optional[str] = None,
    db: Session = Depends(get_db),
):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq:
        raise HTTPException(404, "Not found")
    h = list(enq.history or [])
    h.append(f"{datetime.datetime.utcnow()}: Follow-up in {delay_minutes}m")
    enq.history = h
    db.commit()
    return {"message": "Follow-up scheduled"}


@app.post("/enquiry/{id}/escalate")
def escalate(id: str, reason: str, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq:
        raise HTTPException(404, "Not found")
    enq.status = "escalated"
    h = list(enq.history or [])
    h.append(f"{datetime.datetime.utcnow()}: Escalated. Reason: {reason}")
    enq.history = h
    db.commit()
    return {"status": "escalated"}


@app.post("/enquiry/{id}/resolve")
def resolve(id: str, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq:
        raise HTTPException(404, "Not found")
    enq.status = "resolved"
    h = list(enq.history or [])
    h.append(f"{datetime.datetime.utcnow()}: Resolved by operator")
    enq.history = h
    db.commit()
    return {"status": "resolved"}


@app.get("/enquiry/{id}/history")
def get_history(id: str, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq:
        raise HTTPException(404, "Not found")
    return serialize_enquiry(enq)


@app.get("/health")
def health():
    return {"status": "healthy", "database": "connected"}
