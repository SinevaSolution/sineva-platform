import { getSystemHealthUseCase } from '@/server/container';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function GET() {
  try {
    const healthData = await getSystemHealthUseCase().execute();
    return sendSuccessJson({
      data: healthData,
      message: 'Sineva platform and shared infrastructure health verified',
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
