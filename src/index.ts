import { app } from './server';
import { config } from './lib/config';

app.listen(config.PORT, () => {
  console.log(`NbeamNG server running on port ${config.PORT} (${config.NODE_ENV})`);
});