from sqlalchemy import create_engine, Column, String, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

# SQLite database file
DATABASE_URL = "sqlite:///./revagent.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Enquiry(Base):
    __tablename__ = "enquiries"
    id = Column(String, primary_key=True, index=True)
    customer_name = Column(String)
    channel = Column(String)
    message = Column(String)
    status = Column(String, default="received")
    sop_match = Column(String, nullable=True)
    suggested_response = Column(String, nullable=True)
    recommended_action = Column(String, nullable=True)
    ai_confidence = Column(String, nullable=True)
    payment_link = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    history = Column(JSON, default=[])

Base.metadata.create_all(bind=engine)