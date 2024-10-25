// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const port = process.env.PORT || 3000;
const app = express();


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); 
});


app.listen(port, () => {
  console.log(`port runing in http://localhost:${port}`);
});