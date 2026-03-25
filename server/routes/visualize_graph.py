import json
import networkx as nx
import matplotlib.pyplot as plt

with open("graph.json") as f:
    data = json.load(f)

G = nx.DiGraph()

# nodes
for n in data["nodes"]:
    G.add_node(n["id"], namespace=n["owner_namespace"])

# edges
for e in data["edges"]:
    G.add_edge(e["src"], e["dst"], type=e["type"])

# colors by namespace
color_map = []
for node in G.nodes(data=True):
    ns = node[1]["namespace"]
    if ns == "Client":
        color_map.append("red")
    elif ns == "Server":
        color_map.append("blue")
    else:
        color_map.append("green")

pos = nx.spring_layout(G, k=0.5)

nx.draw(G, pos,
        node_color=color_map,
        with_labels=False,
        node_size=500)

plt.show()