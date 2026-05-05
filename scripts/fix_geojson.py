import json
import random

def fix_geojson():
    file_path = "../app-ui/src/data/silicon_valley_data_centers.geojson"
    with open(file_path, "r") as f:
        data = json.load(f)
        
    random.seed(42)
    # San Jose / Santa Clara populated bounding box
    min_lon, max_lon = -122.1, -121.75
    min_lat, max_lat = 37.25, 37.42
    
    for feature in data.get("features", []):
        new_lon = random.uniform(min_lon, max_lon)
        new_lat = random.uniform(min_lat, max_lat)
        feature["geometry"]["coordinates"] = [new_lon, new_lat]
        
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)
        
    print(f"Fixed {len(data.get('features', []))} geojson coordinates.")

if __name__ == "__main__":
    fix_geojson()
