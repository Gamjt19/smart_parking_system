# Smart Parking System

This project is a comprehensive Smart Parking System that includes a user-facing frontend, a Node.js backend API, and a Python-based Automatic Number Plate Recognition (ANPR) service.

## Prerequisites

Before running the project, ensure you have the following installed on your system:
- **Node.js** (v14 or higher) and npm
- **Python** (v3.8 or higher)
- **MongoDB** (Ensure you have a MongoDB instance running or a MongoDB URI connection string)

## Project Structure

The project is divided into three main folders:
1. `backend/`: The Node.js Express server handling API requests, database connections, and WebSocket communication.
2. `frontend/`: The HTML/CSS/JS frontend application for users and staff.
3. `anpr-service/`: A Python service that processes images of vehicle plates to extract the registration number using OCR.

---

## How to Run the Application

To run the full system, you will need to open **three separate terminal windows** and start each service independently.

### 1. Start the Backend Server

The backend requires environment variables to connect to the database. Ensure you have a `.env` file inside the `backend/` directory with your `MONGO_URI` (e.g., `MONGO_URI=mongodb://localhost:27017/smart-parking`).

Open a terminal, navigate to the `backend` directory, install dependencies, and start the server:

```bash
cd backend
npm install
node server.js
```
The backend server typically runs on `http://localhost:3000`.

### 2. Start the Frontend Application

The frontend consists of static files and can be served using any basic HTTP server.

Open a second terminal, navigate to the `frontend` directory, and start the server:

```bash
cd frontend
npx http-server
```
The frontend will typically be available at `http://localhost:8080`. Open this URL in your browser to interact with the application.

### 3. Start the ANPR Service (Number Plate Recognition)

The ANPR service is an AI/ML service built with Python. Ensure you have installed the required Python packages (usually via `pip install -r requirements.txt` if available, typically requiring OpenCV, EasyOCR, or similar).

Open a third terminal, navigate to the `anpr-service` directory, and run the Python app:

```bash
cd anpr-service
pip install -r requirements.txt  # If this is your first time
python app.py
```
This service will run in the background, analyzing images sent from the frontend/backend.

---

## Usage flow
1. Open the frontend URL in your browser.
2. Users can create an account, register vehicles, and book parking slots.
3. Staff can use the staff dashboard to verify incoming vehicles using the OCR scanner (which communicates with the ANPR service and backend) and manage check-ins/check-outs.
