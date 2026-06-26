import json
import uuid
import random
from datetime import datetime, timedelta

def generate_uuid():
    """Generates a new UUID formatted like the original messages."""
    return "message_" + str(uuid.uuid4())

def parse_time(t_str):
    """Parses the specific custom timestamp format in the original file."""
    try:
        # Original format appears as: "2026-04-15 18:46:56:889"
        if len(t_str) >= 23 and t_str[19] == ':':
            t_str = t_str[:19] + '.' + t_str[20:]
        return datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        try:
            return datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return datetime.now()

def format_time(dt):
    """Restores the timestamp to the exact original custom format."""
    s = dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return s[:19] + ':' + s[20:]

def apply_variation(topic_key, payload):
    """Applies a small, realistic variation to the payload for intermediate/high scans."""
    try:
        val = float(payload)
        if topic_key == 'temp':
            val += random.uniform(-0.15, 0.3)
        elif topic_key == 'humid':
            val += random.uniform(-1.0, 1.5)
        elif topic_key == 'pressure':
            val += random.uniform(-0.5, 0.5)
        return str(round(val, 2))
    except (ValueError, TypeError):
        return payload

def main():
    input_file = 'team11'
    output_file = 'All_connections_updated_reordered.json'
    
    print(f"Loading original data from '{input_file}'...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    # Handle array or object structures safely
    connections = data if isinstance(data, list) else [data]
        
    for connection in connections:
        if 'messages' not in connection:
            continue
            
        original_msgs = connection['messages']
        
        # 1. Filter out distance, accel, and keep only temp, hum, pressure
        valid_msgs = []
        for m in original_msgs:
            topic = m.get('topic', '')
            if 'distance' in topic or 'accel' in topic:
                continue
            if any(k in topic for k in ['temp', 'humid', 'pressure']):
                valid_msgs.append(m)
                
        # 2. Sort by creation time so we process the sequence chronologically
        valid_msgs.sort(key=lambda msg: parse_time(msg.get('createAt', '')))
        
        # 3. Group readings by approximate time (within 2 seconds)
        groups = []
        if valid_msgs:
            current_group = [valid_msgs[0]]
            current_time = parse_time(valid_msgs[0].get('createAt'))
            for m in valid_msgs[1:]:
                m_time = parse_time(m.get('createAt'))
                if (m_time - current_time).total_seconds() < 2.0:
                    current_group.append(m)
                else:
                    groups.append(current_group)
                    current_group = [m]
                    current_time = m_time
            if current_group:
                groups.append(current_group)
                
        new_messages = []
        x, y = 0.0, 0.0
        max_x = 5.0 # Wrap grid after 5 meters 
        max_y = 5.0 # Bound room length to 5 meters
        
        # 4. Generate the new interpolated and consolidated sequence
        for group in groups:
            base_time = parse_time(group[0].get('createAt'))
            heights = ["low", "intermediate", "high"]
            
            # Extract the baseline readings for this time group
            base_readings = {}
            for msg in group:
                topic = msg.get('topic', '')
                if 'temp' in topic:
                    base_readings['temp'] = msg.get('payload')
                elif 'humid' in topic:
                    base_readings['humid'] = msg.get('payload')
                elif 'pressure' in topic:
                    base_readings['pressure'] = msg.get('payload')
            
            # For each base group position, scan all 3 heights
            for i, z in enumerate(heights):
                current_time = base_time + timedelta(seconds=i*2)
                
                # Build a single consolidated entry
                combined_msg = {
                    "id": generate_uuid(),
                    "createAt": format_time(current_time),
                    "x": x,
                    "y": y,
                    "z": z
                }
                
                # Inject and slightly vary the payloads for higher Z-levels
                if 'temp' in base_readings:
                    combined_msg['temperature'] = apply_variation('temp', base_readings['temp']) if i > 0 else base_readings['temp']
                    
                if 'humid' in base_readings:
                    combined_msg['humidity'] = apply_variation('humid', base_readings['humid']) if i > 0 else base_readings['humid']
                    
                if 'pressure' in base_readings:
                    combined_msg['pressure'] = apply_variation('pressure', base_readings['pressure']) if i > 0 else base_readings['pressure']

                new_messages.append(combined_msg)
            
            # 5. Move robot to the next 0.5m grid position
            x += 0.5
            if x > max_x:
                x = 0.0
                y += 0.5
                if y > max_y:
                    y = 0.0 # Reset back to start of the room
                
        # Replace original messages with our newly scaled, flattened sequence
        connection['messages'] = new_messages

    print(f"Writing expanded structure to '{output_file}'...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
        
    print("Done! The routine has been successfully optimized and embedded.")

if __name__ == "__main__":
    main()