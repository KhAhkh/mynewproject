import http from 'http';

// First login to get session
const loginData = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const loginOptions = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';
  const cookies = res.headers['set-cookie'];
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200 && cookies) {
      console.log('Login successful');
      
      // Now test stock API with cookie
      const stockOptions = {
        hostname: 'localhost',
        port: 4000,
        path: '/api/reports/stock/company-wise-cost',
        method: 'GET',
        headers: {
          'Cookie': cookies[0].split(';')[0]
        }
      };
      
      const stockReq = http.request(stockOptions, (stockRes) => {
        let stockData = '';
        
        stockRes.on('data', (chunk) => {
          stockData += chunk;
        });
        
        stockRes.on('end', () => {
          console.log('\nStock API Response:');
          console.log('Status Code:', stockRes.statusCode);
          try {
            const json = JSON.parse(stockData);
            console.log(JSON.stringify(json, null, 2));
          } catch (e) {
            console.log(stockData);
          }
        });
      });
      
      stockReq.on('error', (error) => {
        console.error('Stock API Error:', error.message);
      });
      
      stockReq.end();
    } else {
      console.log('Login failed:', data);
    }
  });
});

loginReq.on('error', (error) => {
  console.error('Login Error:', error.message);
});

loginReq.write(loginData);
loginReq.end();
