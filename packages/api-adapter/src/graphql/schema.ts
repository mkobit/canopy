import { buildSchema, type GraphQLSchema } from 'graphql';
import { GRAPHQL_SDL_SCHEMA } from './schema-sdl';

export const buildGraphQLSchema = (): GraphQLSchema => {
  return buildSchema(GRAPHQL_SDL_SCHEMA);
};
