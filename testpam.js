var pam = require('authenticate-pam');
pam.authenticate(
  'username',
  'password',
  function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('Authenticated!');
    }
  },
  { serviceName: 'login', remoteHost: 'localhost' }
);
