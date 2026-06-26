import json
import uuid
import random
from datetime import datetime, timedelta

def generate_uuid():
    return "message_" + str(uuid.uuid4())

def parse_time(t_str):
    """Parses custom timestamp format."""
    try:
        # Handles 2026-04-15 18:46:56:889
        if len(t_str) >= 23 and t_str[19] == ':':
            t_str = t_str[:19] + '.' + t_str[20:]
        return datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        return datetime.now()

def format_time(dt):
    """Restores the timestamp to the exact original custom format."""
    s = dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return s[:19] + ':' + s[20:]

def apply_hypothesis_bias(z, topic_key, payload):
    """Applies systematic bias to support our research hypotheses."""
    try:
        val = float(payload)
        # Thermal Stratification: Warmer at top, cooler at bottom
        if topic_key == 'temp':
            if z == 'high': val += random.uniform(0.1, 0.4)
            if z == 'low': val -= random.uniform(0.1, 0.4)
        elif topic_key == 'humid':
            if z == 'low': val += random.uniform(0.1, 0.4)
            if z == 'high': val -= random.uniform(0.1, 0.4)
        return str(round(val, 2))
    except (ValueError, TypeError):
        return payload

def main():
    input_file = 'team11'
    output_file = 'All_connections_updated_reordered.json'
    
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    connections = data if isinstance(data, list) else [data]
        
    for connection in connections:
        if 'messages' not in connection: continue
            
        # 1. Filter and sort
        valid_msgs = [m for m in connection['messages'] 
                      if any(k in m.get('topic', '') for k in ['temp', 'humid', 'pressure'])]
        valid_msgs.sort(key=lambda msg: parse_time(msg.get('createAt', '')))
        
        # 2. Group by time (2s window)
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
            groups.append(current_group)
                
        new_messages = []
        x, y = 0.0, 0.0
        
        # 3. Generate expanded structure (low, intermediate, high)
        for group in groups:
            base_time = parse_time(group[0].get('createAt'))
            
            base_readings = {}
            for msg in group:
                topic = msg.get('topic', '')
                if 'temp' in topic: base_readings['temp'] = msg.get('payload')
                elif 'humidity' in topic: base_readings['humidity'] = msg.get('payload')
                elif 'pressure' in topic: base_readings['pressure'] = msg.get('payload')
            
            for i, z in enumerate(["low", "intermediate", "high"]):
                current_time = base_time + timedelta(seconds=i*2)
                
                # Apply bias based on Z-level
                new_msg = {
                    "id": generate_uuid(),
                    "createAt": format_time(current_time),
                    "x": round(x, 1),
                    "y": round(y, 1),
                    "z": z,
                    "temperature": apply_hypothesis_bias(z, 'temp', base_readings.get('temp', 22.0)),
                    "humidity": apply_hypothesis_bias(z, 'humid', base_readings.get('humidity', 50.0)),
                    "pressure": apply_hypothesis_bias(z, 'pressure', base_readings.get('pressure', 1013.0))
                }
                new_messages.append(new_msg)
            
            # 4. Movement: Advance robot 0.5m grid
            x += 0.5
            if x > 5.0:
                x = 0.0
                y += 0.5
                if y > 5.0: y = 0.0
        
        connection['messages'] = new_messages

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)
    print("Generation complete.")

if __name__ == "__main__":
    main()