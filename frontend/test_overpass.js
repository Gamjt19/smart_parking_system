const fetch = require('node-fetch');

const lat = 9.9816; // Kochi approx
const lon = 76.2999;
const radius = 3000;

const query = `
    [out:json];
    (
      node["amenity"="parking"](around:${radius}, ${lat}, ${lon});
      way["amenity"="parking"](around:${radius}, ${lat}, ${lon});
      relation["amenity"="parking"](around:${radius}, ${lat}, ${lon});
    );
    out center;
    is_in;
    out tags;
`;

console.log("Fetching...");
fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query))
    .then(r => r.json())
    .then(data => {
        console.log(`Found ${data.elements.length} elements`);
        if (data.elements.length > 0) {
            console.log("First element:", data.elements[0]);
        }
    })
    .catch(e => console.error("Error:", e));
