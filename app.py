import os
import json
from flask import Flask, request, jsonify, send_from_directory, Response
from werkzeug.utils import secure_filename
from flask_cors import CORS
from pymongo import MongoClient
import gridfs
from bson import ObjectId
from dotenv import load_dotenv
import queue

load_dotenv()

clients = []

def notify_clients(event_name, data):
    message = f"event: {event_name}\ndata: {json.dumps(data)}\n\n"
    for client in clients:
        client.put(message)

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

MONGO_URI = os.getenv("MONGO_URI")
client = MongoClient(MONGO_URI)
db = client['rakhi_db']
coupons_collection = db['coupons']
fs = gridfs.GridFS(db, collection="audio_files")

# Serve static frontend files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/admin')
def admin():
    return send_from_directory('.', 'admin.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

@app.route('/api/stream')
def stream():
    def event_stream():
        q = queue.Queue()
        clients.append(q)
        try:
            while True:
                yield q.get()
        except GeneratorExit:
            clients.remove(q)
    return Response(event_stream(), mimetype="text/event-stream")

# API Endpoints
@app.route('/api/coupons', methods=['GET'])
def list_coupons():
    try:
        # Get only the keys/codes
        coupons = coupons_collection.find({}, {'code': 1, '_id': 0})
        return jsonify({"keys": [c['code'] for c in coupons]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/coupons/<code>', methods=['GET'])
def get_coupon(code):
    try:
        coupon = coupons_collection.find_one({'code': code}, {'_id': 0})
        if coupon:
            return jsonify({"value": coupon}), 200
        return jsonify({"error": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/coupons/<code>', methods=['POST'])
def set_coupon(code):
    try:
        # Check if the request is multipart/form-data
        if request.content_type and request.content_type.startswith('multipart/form-data'):
            data_str = request.form.get('data')
            if not data_str:
                return jsonify({"error": "No data field"}), 400
            data = json.loads(data_str)
            
            # Handle audio file if present
            file_id = None
            if 'audioFile' in request.files:
                file = request.files['audioFile']
                if file.filename != '':
                    filename = secure_filename(file.filename)
                    # Delete old file if updating (optional, for simplicity we just store new)
                    file_id_obj = fs.put(file, filename=filename, content_type=file.content_type)
                    file_id = str(file_id_obj)
        else:
            data = request.json
            if not data:
                return jsonify({"error": "No data"}), 400
            file_id = None
            
        update_doc = {
            'code': code,
            'message': data.get('message'),
            'photos': data.get('photos', []),
            'giftImage': data.get('giftImage'),
            'createdAt': data.get('createdAt')
        }
        if file_id:
            update_doc['audio_file_id'] = file_id

        # Upsert the coupon
        coupons_collection.update_one(
            {'code': code},
            {'$set': update_doc},
            upsert=True
        )
        
        # Broadcast the update
        notify_clients('coupon_updated', {'code': code})
        
        return jsonify({"success": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/coupons/<code>', methods=['DELETE'])
def delete_coupon(code):
    try:
        coupon = coupons_collection.find_one({'code': code})
        if coupon and 'audio_file_id' in coupon:
            fs.delete(ObjectId(coupon['audio_file_id']))
            
        result = coupons_collection.delete_one({'code': code})
        if result.deleted_count > 0:
            # Broadcast the delete
            notify_clients('coupon_deleted', {'code': code})
            return jsonify({"success": True}), 200
        return jsonify({"error": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/songs/<file_id>/stream', methods=['GET'])
def stream_song(file_id):
    try:
        grid_out = fs.get(ObjectId(file_id))
        file_size = grid_out.length
        
        range_header = request.headers.get('Range', None)
        if not range_header:
            response = Response(grid_out.read(), 200, mimetype=grid_out.content_type, direct_passthrough=True)
            response.headers.add('Content-Length', str(file_size))
            response.headers.add('Accept-Ranges', 'bytes')
            return response

        # Handle Range requests
        byte1, byte2 = 0, None
        match = range_header.replace('bytes=', '').split('-')
        if match[0]:
            byte1 = int(match[0])
        if len(match) > 1 and match[1]:
            byte2 = int(match[1])

        if byte2 is None:
            byte2 = file_size - 1

        # Limit chunks to 1MB to ensure instant playback
        chunk_size = 1024 * 1024
        if (byte2 - byte1 + 1) > chunk_size:
            byte2 = byte1 + chunk_size - 1

        length = byte2 - byte1 + 1

        grid_out.seek(byte1)
        data = grid_out.read(length)

        response = Response(data, 206, mimetype=grid_out.content_type, direct_passthrough=True)
        response.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{file_size}')
        response.headers.add('Content-Length', str(length))
        response.headers.add('Accept-Ranges', 'bytes')
        return response
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=3000, debug=True)
