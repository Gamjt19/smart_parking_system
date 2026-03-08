const fetch = require('node-fetch');

const query = `
    [out:json];
    (
      node["amenity"="parking"](around:3000, 9.9816, 76.2999);
      way["amenity"="parking"](around:3000, 9.9816, 76.2999);
      relation["amenity"="parking"](around:3000, 9.9816, 76.2999);
    );
    out center;
    is_in;
    out tags;
`;

fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query))
    .then(r => r.json())
    .then(data => {
        const parkingLots = data.elements.filter(e => e.tags && e.tags.amenity === 'parking');
        const enclosingAreas = data.elements.filter(e => e.tags && e.tags.amenity !== 'parking');
        console.log('Parking lots size:', parkingLots.length);
        console.log('Enclosing areas size:', enclosingAreas.length);
        const malls = enclosingAreas.filter(e => e.tags && e.tags.shop === 'mall');
        console.log('Malls:', malls.map(m => m.tags.name));
    })
    .catch(e => console.error(e));
