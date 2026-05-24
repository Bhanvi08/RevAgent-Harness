from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends
from sqlalchemy.orm import Session
import uuid, datetime, logging, json
from typing import Optional  # <--- THIS WAS THE MISSING WORD CAUSING THE ERROR
from database import SessionLocal, Enquiry

# --- 1.5 STRUCTURED JSON LOGGING ---
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        return json.dumps(log_record)

logger = logging.getLogger("closira")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

app = FastAPI(title="Closira Backend MVP")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# --- 1.4 ASYNC WORKER LOGIC ---
def process_enquiry_task(enquiry_id: str):
    db = SessionLocal()
    enq = db.query(Enquiry).filter(Enquiry.id == enquiry_id).first()
    if not enq: return

    msg = enq.message.lower()
    sop, resp = None, ""

    if "price" in msg or "cost" in msg:
        sop, resp = "Pricing Inquiry", "Our basic plan starts at 5,000 INR."
    elif "book" in msg or "appointment" in msg:
        sop, resp = "Booking Request", "I can schedule a demo. What time works?"
    elif "complain" in msg or "issue" in msg:
        sop, resp = "Complaint", "We apologize. A manager has been notified."

    h = list(enq.history)
    if sop:
        enq.sop_match, enq.suggested_response, enq.status = sop, resp, "processed"
        h.append(f"{datetime.datetime.utcnow()}: SOP Matched - {sop}")
        logger.info(f"SOP matched for {enquiry_id}: {sop}")
    else:
        enq.status = "escalated"
        h.append(f"{datetime.datetime.utcnow()}: No SOP match - Escalated")
        logger.info(f"Escalation triggered for {enquiry_id}")
    
    enq.history = h
    db.commit()
    db.close()

# --- 1.3 API ENDPOINTS ---

@app.get("/")
def home():
    return {"message": "Closira API is live! Go to /docs to test endpoints."}

@app.post("/enquiry")
async def create_enquiry(name: str, channel: str, message: str, bg: BackgroundTasks, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    new_enq = Enquiry(id=job_id, customer_name=name, channel=channel, message=message, history=[])
    db.add(new_enq)
    db.commit()
    
    logger.info(f"Enquiry created: {job_id}")
    bg.add_task(process_enquiry_task, job_id)
    return {"job_id": job_id, "status": "processing"}

@app.post("/enquiry/{id}/follow-up")
def schedule_follow_up(id: str, delay_minutes: int, message_template: Optional[str] = None, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq: raise HTTPException(404, "Not found")
    h = list(enq.history)
    h.append(f"{datetime.datetime.utcnow()}: Follow-up in {delay_minutes}m")
    enq.history = h
    db.commit()
    return {"message": "Follow-up scheduled"}

@app.post("/enquiry/{id}/escalate")
def escalate(id: str, reason: str, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq: raise HTTPException(404, "Not found")
    enq.status = "escalated"
    h = list(enq.history)
    h.append(f"{datetime.datetime.utcnow()}: Escalated. Reason: {reason}")
    enq.history = h
    db.commit()
    return {"status": "escalated"}

@app.get("/enquiry/{id}/history")
def get_history(id: str, db: Session = Depends(get_db)):
    enq = db.query(Enquiry).filter(Enquiry.id == id).first()
    if not enq: raise HTTPException(404, "Not found")
    return enq

@app.get("/health")
def health():
    return {"status": "healthy", "database": "connected"}