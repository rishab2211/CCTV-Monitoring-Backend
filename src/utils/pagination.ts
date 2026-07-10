import { Query } from "mongoose";

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Parses pagination params from request query.
 * Applies safe defaults and enforces maximum limit.
 */
export const parsePaginationParams = (
  query: Record<string, unknown>
): Required<PaginationOptions> => {
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(query.limit ?? "10"), 10) || 10)
  );
  const sortBy = String(query.sortBy ?? "createdAt");
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  return { page, limit, sortBy, sortOrder };
};

/**
 * Generic pagination helper for Mongoose models.
 *
 * Usage:
 *   const result = await paginate(User.find({ role: 'operator' }), User, { page: 2, limit: 20 });
 */
export const paginate = async <T>(
  query: Query<T[], T>,
  countQuery: Query<number, T>,
  options: Required<PaginationOptions>
): Promise<PaginationResult<T>> => {
  const { page, limit, sortBy, sortOrder } = options;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    query
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
    countQuery.exec(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: data as T[],
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};
