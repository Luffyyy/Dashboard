import json
import math
import uuid
import random
import requests
import time  # <--- Added for rate-limit delays
from datetime import datetime, timedelta

# --- CONFIGURATION ---
DAYS_TO_GENERATE = 5  # Updated to 5 days matching configuration header
LATITUDE = 32.9124
LONGITUDE = 35.2913

THERMAL_LAG_HOURS = 3
INDOOR_COUPLING = 0.25
BASE_STRATIFICATION = 0.25
STRATIFICATION_LOAD_GAIN = 0.03
STRAT_CAP_DEVIATION = 15.0

TEMP_NOISE_STD = 0.08
HUMID_NOISE_STD = 0.3
PRESS_NOISE_STD = 0.05
TEMP_NOISE_PHI = 0.55
HUMID_NOISE_PHI = 0.5
PRESS_NOISE_PHI = 0.7

LOCATION_TEMP_STD = 0.3    # deg C location-to-location variation within a zone
LOCATION_HUMID_STD = 1.5   # % RH location-to-location variation within a zone

TEMP_BOUNDS = (-10.0, 50.0)
HUMID_BOUNDS = (1.0, 100.0)
PRESS_BOUNDS = (900.0, 1100.0)

MAGNUS_A, MAGNUS_B = 17.62, 243.12


def generate_uuid():
    return "message_" + str(uuid.uuid4())


def parse_time(t_str):
    try:
        if len(t_str) >= 23 and t_str[19] == ':':
            t_str = t_str[:19] + '.' + t_str[20:]
        return datetime.strptime(t_str, "%Y-%m-%d %H:%M:%S.%f")
    except ValueError:
        return None


def format_time(dt):
    s = dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return s[:19] + ':' + s[20:]


def clamp(value, bounds):
    lo, hi = bounds
    return max(lo, min(hi, value))


def dew_point(temp_c, rh_pct):
    rh_pct = max(rh_pct, 0.1)
    gamma = math.log(rh_pct / 100.0) + (MAGNUS_A * temp_c) / (MAGNUS_B + temp_c)
    return (MAGNUS_B * gamma) / (MAGNUS_A - gamma)


def rh_from_dew_point(temp_c, dew_c):
    es_t = math.exp((MAGNUS_A * temp_c) / (MAGNUS_B + temp_c))
    es_td = math.exp((MAGNUS_A * dew_c) / (MAGNUS_B + dew_c))
    return clamp(100.0 * es_td / es_t, HUMID_BOUNDS)


class ArNoise:
    def __init__(self, phi, sigma):
        self.phi = phi
        self.innovation_std = sigma * math.sqrt(max(1e-6, 1 - phi ** 2))
        self.state = random.gauss(0, sigma)

    def next(self):
        self.state = self.phi * self.state + random.gauss(0, self.innovation_std)
        return self.state


def fetch_karmiel_weather(start_date, end_date):
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": LATITUDE,
        "longitude": LONGITUDE,
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": end_date.strftime("%Y-%m-%d"),
        "hourly": "temperature_2m,relative_humidity_2m,surface_pressure",
        "timezone": "Asia/Jerusalem"
    }
    try:
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        res_data = response.json()
        hourly_data = res_data.get("hourly", {})
        times = hourly_data.get("time", [])
        temps = hourly_data.get("temperature_2m", [])
        humids = hourly_data.get("relative_humidity_2m", [])
        pressures = hourly_data.get("surface_pressure", [])

        weather_timeline = {}
        for i in range(len(times)):
            t, h, p = temps[i], humids[i], pressures[i]
            if t is None or h is None or p is None:
                continue
            key = times[i].replace("T", " ")[:16]
            weather_timeline[key] = (float(t), float(h), float(p))

        if not weather_timeline:
            raise ValueError("API returned no usable hourly records")
        return weather_timeline
    except Exception as e:
        print(f"API Warning ({e}). Falling back to synthetic diurnal model.")
        return None


def synthetic_diurnal_weather(start_date, end_date, base_temp=24.0, temp_amplitude=6.0,
                               base_humid=55.0, base_press=1011.0):
    base_dew = dew_point(base_temp, base_humid)
    weather_map = {}
    cur_day = start_date
    while cur_day <= end_date + timedelta(days=1):
        for hour in range(24):
            ts = cur_day.replace(hour=hour, minute=0, second=0, microsecond=0)
            phase = 2 * math.pi * (hour - 15) / 24.0
            temp = base_temp + temp_amplitude * math.cos(phase)
            humid = rh_from_dew_point(temp, base_dew)
            press = base_press + 1.2 * math.sin(2 * math.pi * hour / 12.42)
            weather_map[ts.strftime("%Y-%m-%d %H:00")] = (temp, humid, press)
        cur_day += timedelta(days=1)
    return weather_map


def interpolate_weather(weather_map, dt):
    floor_dt = dt.replace(minute=0, second=0, microsecond=0)
    ceil_dt = floor_dt + timedelta(hours=1)
    v0 = weather_map.get(floor_dt.strftime("%Y-%m-%d %H:00"))
    v1 = weather_map.get(ceil_dt.strftime("%Y-%m-%d %H:00"))
    if v0 is None and v1 is None:
        return None
    if v0 is None:
        return v1
    if v1 is None:
        return v0
    frac = (dt - floor_dt).total_seconds() / 3600.0
    return tuple(a + (b - a) * frac for a, b in zip(v0, v1))


def filtered_mean(values, bounds, fallback):
    lo, hi = bounds
    cleaned = [v for v in values if lo <= v <= hi]
    return (sum(cleaned) / len(cleaned)) if cleaned else fallback


def main():
    input_file = 'team11'
    output_file = 'All_connections_updated_reordered.json'

    start_filter_date = datetime(2026, 6, 22, 0, 0, 0)
    end_filter_date = start_filter_date + timedelta(days=DAYS_TO_GENERATE)

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    connections = data if isinstance(data, list) else [data]

    raw_temps, raw_humids, raw_pressures = [], [], []
    for connection in connections:
        if 'messages' not in connection:
            continue
        for m in connection['messages']:
            topic = m.get('topic', '')
            try:
                val = float(m.get('payload', 0))
                if 'temp' in topic:
                    raw_temps.append(val)
                elif 'humidity' in topic:
                    raw_humids.append(val)
                elif 'pressure' in topic:
                    raw_pressures.append(val)
            except (ValueError, TypeError):
                continue

    dataset_avg_temp = filtered_mean(raw_temps, TEMP_BOUNDS, 23.5)
    dataset_avg_humid = filtered_mean(raw_humids, HUMID_BOUNDS, 48.0)
    dataset_avg_press = filtered_mean(raw_pressures, PRESS_BOUNDS, 1010.0)
    dataset_baseline_dew = dew_point(dataset_avg_temp, dataset_avg_humid)

    # Weather map is fetched ONCE globally outside loop to protect API limits
    weather_map = fetch_karmiel_weather(start_filter_date, end_filter_date)
    if weather_map is None:
        weather_map = synthetic_diurnal_weather(start_filter_date, end_filter_date)

    api_temps = [v[0] for v in weather_map.values()]
    api_dewpoints = [dew_point(v[0], v[1]) for v in weather_map.values()]
    api_mean_temp = sum(api_temps) / len(api_temps) if api_temps else dataset_avg_temp
    api_mean_dewpoint = sum(api_dewpoints) / len(api_dewpoints) if api_dewpoints else dataset_baseline_dew

    for connection in connections:
        if 'messages' not in connection:
            continue

        valid_msgs = []
        for m in connection['messages']:
            if not any(k in m.get('topic', '') for k in ['temp', 'humid', 'pressure']):
                continue
            msg_time = parse_time(m.get('createAt', ''))
            if msg_time and msg_time >= start_filter_date:
                valid_msgs.append(m)

        valid_msgs.sort(key=lambda msg: parse_time(msg.get('createAt', '')))

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

        temp_noise = {z: ArNoise(TEMP_NOISE_PHI, TEMP_NOISE_STD) for z in ("low", "intermediate", "high")}
        humid_noise = {z: ArNoise(HUMID_NOISE_PHI, HUMID_NOISE_STD) for z in ("low", "intermediate", "high")}
        press_noise = {z: ArNoise(PRESS_NOISE_PHI, PRESS_NOISE_STD) for z in ("low", "intermediate", "high")}

        location_effects: dict[tuple, dict] = {}

        if groups:
            for day_idx in range(DAYS_TO_GENERATE):
                day_shift = timedelta(days=day_idx)

                for group in groups:
                    current_time = parse_time(group[0].get('createAt')) + day_shift
                    lagged_time = current_time - timedelta(hours=THERMAL_LAG_HOURS)

                    weather_now = interpolate_weather(weather_map, lagged_time)
                    if weather_now is None:
                        out_temp, out_humid, out_press = api_mean_temp, dataset_avg_humid, dataset_avg_press
                    else:
                        out_temp, out_humid, out_press = weather_now

                    temp_deviation = out_temp - api_mean_temp
                    out_dewpoint = dew_point(out_temp, out_humid)
                    dewpoint_deviation = out_dewpoint - api_mean_dewpoint

                    indoor_dewpoint = dataset_baseline_dew + dewpoint_deviation * INDOOR_COUPLING

                    strat_amplitude = BASE_STRATIFICATION * (
                        1 + STRATIFICATION_LOAD_GAIN * min(abs(temp_deviation), STRAT_CAP_DEVIATION)
                    )
                    
                    # --- SCENARIO MODIFIERS BASED ON THE DAY ---
                    scenario_temp_offset = 0.0
                    scenario_strat_multiplier = 1.0
                    
                    if day_idx == 0:
                        # Scenario 1: Base Scenario (June 22)
                        pass
                        
                    elif day_idx == 1:
                        # Scenario 2: System Stress/Disruption (June 23)
                        scenario_temp_offset = 6.0
                        scenario_strat_multiplier = 3.0
                        
                    elif day_idx == 2:
                        # Scenario 3: System Recovery/Rehabilitation (June 24)
                        hour_of_day = current_time.hour + (current_time.minute / 60.0)
                        recovery_factor = max(0.0, 1.0 - (hour_of_day / 24.0))
                        scenario_temp_offset = 5.0 * recovery_factor
                        scenario_strat_multiplier = 1.0 + (1.5 * recovery_factor)
                        
                    else:
                        # Extra Simulation Framework Stability for Remaining Days (Days 4 & 5)
                        pass

                    strat_amplitude *= scenario_strat_multiplier
                    
                    strat_offset = {
                        "low": -strat_amplitude / 2,
                        "intermediate": 0.0,
                        "high": strat_amplitude / 2,
                    }

                    for i, z in enumerate(("low", "intermediate", "high")):
                        step_time = current_time + timedelta(seconds=i * 2)

                        loc_key = (round(x, 1), round(y, 1), z)
                        if loc_key not in location_effects:
                            location_effects[loc_key] = {
                                'temp': random.gauss(0, LOCATION_TEMP_STD),
                                'humid': random.gauss(0, LOCATION_HUMID_STD),
                            }
                        effect = location_effects[loc_key]

                        # --- 1. TEMPERATURE ---
                        room_temp_mu = (
                            dataset_avg_temp
                            + temp_deviation * INDOOR_COUPLING
                            + strat_offset[z]
                            + effect['temp']   
                            + scenario_temp_offset
                        )
                        final_temp = clamp(room_temp_mu + temp_noise[z].next(), TEMP_BOUNDS)

                        # --- 2. HUMIDITY ---
                        true_rh = rh_from_dew_point(final_temp, indoor_dewpoint)
                        final_humid = clamp(true_rh + effect['humid'] + humid_noise[z].next(), HUMID_BOUNDS)

                        # --- 3. PRESSURE ---
                        final_press = clamp(out_press + press_noise[z].next(), PRESS_BOUNDS)

                        new_msg = {
                            "id": generate_uuid(),
                            "createAt": format_time(step_time),
                            "x": round(x, 1),
                            "y": round(y, 1),
                            "z": z,
                            "temperature": str(round(final_temp, 2)),
                            "humidity": str(round(final_humid, 2)),
                            "pressure": str(round(final_press, 2))
                        }
                        new_messages.append(new_msg)

                    x += 0.5
                    if x > 5.0:
                        x = 0.0
                        y += 0.5
                        if y > 5.0:
                            y = 0.0

        connection['messages'] = new_messages

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

    print(f"Done. Generated {DAYS_TO_GENERATE} days spanning from June 22 onwards smoothly.")


if __name__ == "__main__":
    main()