const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MicrosoftStrategy = require("passport-microsoft").Strategy;
const AuthService = require("../services/authService.js");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.URL_BACKEND}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const token = await AuthService.OAuth(profile);
        if (!token) return done(null, false);
        return done(null, { token });
      } catch (error) {
        console.error("Error en GoogleStrategy:", error);
        done(error);
      }
    }
  )
);

passport.use(
  new MicrosoftStrategy(
    {
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL: `${process.env.URL_BACKEND}/auth/microsoft/callback`,
      scope: ["user.read"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await Auth.OAuth(profile);
        return done(null, user);
      } catch (error) {
        console.error("Error en MicrosoftStrategy:", error);
        done(error);
      }
    }
  )
);
