import json
import uuid
import copy
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

def apply_variation(topic, payload):
    """Applies a small, realistic variation to the payload for intermediate/high scans."""
    try:
        val = float(payload)
        if 'temp' in topic:
            val += random.uniform(-0.15, 0.3)
        elif 'humid' in topic:
            val += random.uniform(-1.0, 1.5)
        elif 'pressure' in topic:
            val += random.uniform(-0.5, 0.5)
        return str(round(val, 2))
    except ValueError:
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
        
        # 3. Group readings by approximate time (e.g., within 2 seconds of each other)
        #    This ensures all sensors read at the "same spot" are processed together.
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
        max_x = 10.0 # Wrap grid after 10 meters 
        max_y = 10.0 # Bound room length to 10 meters
        
        # 4. Generate the new interpolated routine sequence
        for group in groups:
            base_time = parse_time(group[0].get('createAt'))
            heights = ["low", "intermediate", "high"]
            
            # For each base group position, scan all 3 heights
            for i, z in enumerate(heights):
                # Offset the timestamp by 2 seconds for each height shift
                current_time = base_time + timedelta(seconds=i*2)
                
                for msg in group:
                    # Clone the original structured MQTT message
                    new_msg = copy.deepcopy(msg)
                    
                    # Update internal IDs and Timestamps
                    new_msg['id'] = generate_uuid()
                    new_msg['createAt'] = format_time(current_time)
                    if 'properties' in new_msg:
                        new_msg['properties']['id'] = new_msg['id']
                        new_msg['properties']['createAt'] = new_msg['createAt']
                        
                    # Shift the payload slightly for intermediate & high levels
                    if i > 0:
                        new_msg['payload'] = apply_variation(new_msg['topic'], new_msg['payload'])
                        if 'properties' in new_msg:
                            new_msg['properties']['payload'] = new_msg['payload']
                            
                    # Inject the new position properties straight into the original structure
                    new_msg['x'] = x
                    new_msg['y'] = y
                    new_msg['z'] = z

                    new_messages.append(new_msg)
            
            # 5. Move robot to the next 0.5m grid position for the next chronological reading block
            x += 0.5
            if x > max_x:
                x = 0.0
                y += 0.5
                if y > max_y:
                    y = 0.0 # Reset back to start of the room to stay within 10x10 bounds
                
        # Replace original messages with our newly scaled routine sequence
        connection['messages'] = new_messages

    print(f"Writing expanded structure to '{output_file}'...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
        
    print("Done! The routine has been successfully embedded.")

if __name__ == "__main__":
    main()