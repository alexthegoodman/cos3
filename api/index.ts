import express from "express";
import { prisma } from "./lib/prisma";

const app = express();
const port = 3001;

app.get('/', async (req, res) => {
  let userCount = await prisma.user.count();

  res.send('User Count: ' + userCount);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
