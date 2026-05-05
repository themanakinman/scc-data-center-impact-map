import os
import json
import osmnx as ox
import networkx as nx
import geopandas as gpd

# Enable cache
ox.settings.use_cache = True

def generate_reachability():
    city = "Santa Clara County, California, USA"
    
    graph_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "santa_clara_graph.graphml"))
    graph_pkl = os.path.abspath(os.path.join(os.path.dirname(__file__), "santa_clara_graph.pkl"))
    import pickle
    if os.path.exists(graph_pkl):
        print(f"Loading binary cached street network for {city}...")
        with open(graph_pkl, 'rb') as f:
            G = pickle.load(f)
    elif os.path.exists(graph_file):
        print(f"Loading XML street network for {city} and building binary cache...")
        G = ox.load_graphml(graph_file)
        with open(graph_pkl, 'wb') as f:
            pickle.dump(G, f)
    else:
        print(f"Downloading street network for {city}...")
        G = ox.graph_from_place(city, network_type="drive", simplify=True)
        ox.save_graphml(G, graph_file)
        with open(graph_pkl, 'wb') as f:
            pickle.dump(G, f)
    
    print("Loading data centers from GeoJSON...")
    dc_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "../app-ui/src/data/silicon_valley_data_centers.geojson"))
    with open(dc_file, "r") as f:
        dc_data = json.load(f)
        
    dc_coords = []
    # Extract coordinates AND the actual Megawatt footprint for realistic physical modeling
    for feature in dc_data.get("features", []):
        coords = feature.get("geometry", {}).get("coordinates")
        props = feature.get("properties", {})
        mw = props.get("it_load_mw", 5.0)
        if coords and len(coords) >= 2:
            lon, lat = coords[0], coords[1]
            dc_coords.append((lat, lon, mw))
            
    print(f"Found {len(dc_coords)} data centers. Finding nearest nodes on the road graph...")
    
    Y = [lat for lat, lon, mw in dc_coords]
    X = [lon for lat, lon, mw in dc_coords]
    MWs = [mw for lat, lon, mw in dc_coords]
    
    # Process all coordinates in a single vectorized KDTree query (14s -> 0.1s delay)
    closest_nodes = ox.distance.nearest_nodes(G, X, Y)
    
    node_mw = {}
    for n, mw in zip(closest_nodes, MWs):
        node_mw[n] = node_mw.get(n, 0.0) + mw
        
    unique_dc_nodes = list(node_mw.keys())
    
    print(f"Running shortest path clustering from {len(unique_dc_nodes)} unique road intersections...")
    # Base temperature is 0.0
    node_heat = {n: 0.0 for n in G.nodes()}
    
    MAX_RADIUS = 2500.0
    
    for _i, dc_node in enumerate(unique_dc_nodes):
        distances = nx.single_source_dijkstra_path_length(G, dc_node, weight='length', cutoff=MAX_RADIUS)
        
        # Base cluster weight literally determined by the overlapping facility MW bounds!
        weight_multiplier = node_mw[dc_node]
            
        for n, dist in distances.items():
            # Additive radial heat overlap
            boost = max(0.0, 1.0 - (dist / MAX_RADIUS)) * weight_multiplier
            node_heat[n] += boost
            
    import math
    physical_max = max(node_heat.values()) if node_heat else 0.0
    
    # LOGARITHMIC SCALING 
    # Hardcode mapping ceiling explicitly so that 500MW absolutely targets 4.0 (Red)
    # This prevents the dynamic "stretching" relativity previously encountered and 
    # correctly suppresses ambiently overlapping 10-20MW clusters back into deep Blue (<2.0).
    max_log_h = math.log10(500.0)
    
    print(f"Physical highest peak is {physical_max}. Binding layout geometrically using strict {max_log_h} logarithmic anchor for 500MW ceiling...")
    
    # Cache the dataframe natively to skip a 14s graph casting loop
    edges_cache_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "santa_clara_edges.pkl"))
    if os.path.exists(edges_cache_file):
        import pandas as pd
        edges = pd.read_pickle(edges_cache_file)
    else:
        nodes, edges = ox.graph_to_gdfs(G)
        edges = edges.reset_index()
        # Strip all metadata except the raw topological structure required for mapping
        edges = edges[['u', 'v', 'geometry']]
        import pandas as pd
        edges.to_pickle(edges_cache_file)
        
    # Vectorize the topological temperature assignment
    import numpy as np
    
    # Map raw nodes directly via rapid hash joining
    edges['h_u'] = edges['u'].map(node_heat).fillna(0.0)
    edges['h_v'] = edges['v'].map(node_heat).fillna(0.0)
    edges['max_edge_heat'] = edges[['h_u', 'h_v']].max(axis=1)
    
    # Vectorized mathematical scale mapping
    log_h = np.log10(edges['max_edge_heat'] + 1.0)
    temp = np.minimum(4.0, (log_h / max_log_h) * 4.0)
    edges['temperature'] = temp.round(2)
    
    print("Preparing for GeoJSON export...")
    columns_to_keep = ['temperature', 'geometry']
    
    existing_cols = [c for c in columns_to_keep if c in edges.columns]
    edges_clean = edges[existing_cols].copy()
    
    edges_clean = edges_clean[edges_clean.geometry.notnull()]
    
    # CRITICAL OPTIMIZATION: Do not export empty streets to the heatmap overlay!
    edges_clean = edges_clean[edges_clean['temperature'] > 0.05]
            
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../app-ui/public"))
    out_path = os.path.join(out_dir, "santa_clara_reachability.geojson")
    
    print(f"Saving to {out_path}...")
    edges_clean.to_file(out_path, driver="GeoJSON")
    print("Saved successfully!")

if __name__ == "__main__":
    generate_reachability()
