const http = require('http');

const data = JSON.stringify({
    vehicleNumber: 'KL28C5110',
    parkingAreaId: '69ad0fb99f4635577ae4d5f0'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/staff/check-in',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
