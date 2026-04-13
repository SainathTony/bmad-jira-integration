import axios, { AxiosInstance } from 'axios';

export interface TrelloList  { id: string; name: string; closed: boolean; }
export interface TrelloLabel { id: string; name: string; color: string; }
export interface TrelloCard  { id: string; name: string; idList: string; shortUrl: string; }
export interface TrelloBoard { id: string; name: string; }

const TRELLO_COLORS = [
  'blue', 'green', 'orange', 'red', 'purple',
  'pink', 'lime', 'sky', 'grey', 'yellow',
];

export class TrelloClient {
  private http: AxiosInstance;

  constructor(private apiKey: string, private token: string) {
    this.http = axios.create({
      baseURL: 'https://api.trello.com/1',
      params: { key: apiKey, token },
      headers: { Accept: 'application/json' },
    });

    this.http.interceptors.response.use(
      (r) => r,
      (err) => {
        if (axios.isAxiosError(err) && err.response) {
          const body = typeof err.response.data === 'string'
            ? err.response.data
            : JSON.stringify(err.response.data, null, 2);
          throw new Error(`Trello API ${err.response.status}: ${body}`);
        }
        throw err;
      }
    );
  }

  async getBoard(boardId: string): Promise<TrelloBoard> {
    const { data } = await this.http.get<TrelloBoard>(`/boards/${boardId}`, {
      params: { fields: 'id,name' },
    });
    return data;
  }

  async getLists(boardId: string): Promise<TrelloList[]> {
    const { data } = await this.http.get<TrelloList[]>(`/boards/${boardId}/lists`, {
      params: { fields: 'id,name,closed', filter: 'open' },
    });
    return data;
  }

  async getLabels(boardId: string): Promise<TrelloLabel[]> {
    const { data } = await this.http.get<TrelloLabel[]>(`/boards/${boardId}/labels`, {
      params: { fields: 'id,name,color', limit: 200 },
    });
    return data;
  }

  async createLabel(boardId: string, name: string, colorIndex: number): Promise<TrelloLabel> {
    const color = TRELLO_COLORS[colorIndex % TRELLO_COLORS.length];
    const { data } = await this.http.post<TrelloLabel>('/labels', {
      name,
      color,
      idBoard: boardId,
    });
    return data;
  }

  async createCard(
    listId: string,
    name: string,
    desc: string,
    labelIds: string[]
  ): Promise<TrelloCard> {
    const { data } = await this.http.post<TrelloCard>('/cards', {
      idList: listId,
      name,
      desc,
      idLabels: labelIds.join(','),
    });
    return data;
  }

  async moveCard(cardId: string, listId: string): Promise<void> {
    await this.http.put(`/cards/${cardId}`, { idList: listId });
  }

  async updateCard(cardId: string, updates: { name?: string; desc?: string }): Promise<void> {
    await this.http.put(`/cards/${cardId}`, updates);
  }
}
