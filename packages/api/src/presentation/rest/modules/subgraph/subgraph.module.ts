import {Module} from '@nestjs/common';
import {SubgraphController} from './subgraph.controller.js';

/**
 * Module for subgraph functionality
 */
@Module({
  controllers: [SubgraphController],
  providers: [],
  exports: [],
})
export class SubgraphModule {}
