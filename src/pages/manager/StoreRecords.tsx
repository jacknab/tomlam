import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PlusCircle, Search, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import axios from 'axios';

interface Store {
  id: string;
  store_number: number;
  storeid: number;
  store_name: string;
  phone_number: string;
  pin: string;
  review_sms: string;
  checkout_sms: string | null;
  promo_name: string | null;
  promo_sms: string | null;
  promo_trigger: number | null;
  sms_count: number;
  sms_plan: number;
  birthday_promo: string | null;
  birthday_sms: string | null;
  created_at: string;
  month_count: number | null;
}

interface StoreRecordsProps {
  storeId: string;
}

const StoreRecords: React.FC<StoreRecordsProps> = ({ storeId }) => {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: keyof Store } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Store>>({
    store_name: '',
    phone_number: '',
    pin: '',
    storeid: 0,
    store_number: 0,
    review_sms: 'Thank you for visiting! If you enjoyed your experience, please leave us a review.',
    checkout_sms: '',
    promo_name: '',
    promo_sms: '',
    promo_trigger: 0,
    sms_plan: 0,
    sms_count: 0,
    birthday_promo: '',
    birthday_sms: 'Happy Birthday! 🎉 Thank you for being our valued customer. We hope you have a wonderful day filled with joy and celebration!',
    month_count: 0
  });

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    fetchStores();
  }, [currentPage, searchTerm]);

  const fetchStores = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('store')
        .select('*', { count: 'exact' });

      // Apply search filter if searchTerm exists
      if (searchTerm) {
        query = query.or(`store_name.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`);
      }

      // Apply pagination
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE - 1;
      
      const { data, count, error } = await query
        .order('store_number', { ascending: true })
        .range(start, end);

      if (error) throw error;

      setStores(data || []);
      setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stores');
      console.error('Error fetching stores:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // If review link is provided, create short URL
      let shortUrl = formData.review_link;
      if (formData.review_link) {
        const response = await axios.post('http://149.28.242.6:5000/api/shorten', {
          originalUrl: formData.review_link,
          alias: formData.store_number?.toString()
        });
        shortUrl = response.data.shortUrl;
      }

      // Format phone number
      const formattedPhone = formData.phone_number?.startsWith('+1')
        ? formData.phone_number
        : `+1${formData.phone_number?.replace(/\D/g, '')}`;

      const { error } = await supabase
        .from('store')
        .insert({
          ...formData,
          phone_number: formattedPhone,
          review_link: shortUrl,
          sms_count: 0
        });

      if (error) throw error;

      setShowForm(false);
      setFormData({
        store_name: '',
        phone_number: '',
        pin: '',
        storeid: 0,
        store_number: 0,
        review_sms: 'Thank you for visiting! If you enjoyed your experience, please leave us a review.',
        checkout_sms: '',
        promo_name: '',
        promo_sms: '',
        promo_trigger: 0,
        sms_plan: 0,
        sms_count: 0,
        birthday_promo: '',
        birthday_sms: 'Happy Birthday! 🎉 Thank you for being our valued customer. We hope you have a wonderful day filled with joy and celebration!',
        month_count: 0
      });
      fetchStores();
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : err.response?.data?.error || 'Failed to create store';
      setError(errorMessage);
      console.error('Error creating store:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellClick = (store: Store, field: keyof Store) => {
    setEditingCell({ id: store.id, field });
    setEditValue(String(store[field] ?? ''));
  };

  const handleCellSave = async () => {
    if (!editingCell) return;

    setSavingId(editingCell.id);
    try {
      let valueToSave: any = editValue;

      // Handle review link shortening when editing
      if (editingCell.field === 'review_link' && editValue) {
        try {
          const store = stores.find(s => s.id === editingCell.id);
          const response = await axios.post('https://review.poolets.com/api/shorten/', {
            originalUrl: editValue,
            alias: store?.store_number?.toString()
          });
          valueToSave = response.data.shortUrl;
        } catch (err) {
          throw new Error(err.response?.data?.error || 'Failed to create short URL');
        }
      }

      // Type conversion based on field
      if (['store_number', 'storeid', 'sms_count', 'sms_plan', 'promo_trigger', 'month_count'].includes(editingCell.field)) {
        valueToSave = editValue === '' ? null : Number(editValue);
        if (valueToSave !== null && isNaN(valueToSave)) {
          throw new Error('Invalid number format');
        }
      }

      // Phone number formatting
      if (editingCell.field === 'phone_number' && !editValue.startsWith('+1')) {
        valueToSave = `+1${editValue.replace(/\D/g, '')}`;
      }

      const { error: updateError } = await supabase
        .from('store')
        .update({ [editingCell.field]: valueToSave })
        .eq('id', editingCell.id);

      if (updateError) throw updateError;

      // Update local state
      setStores(stores.map(store => 
        store.id === editingCell.id 
          ? { ...store, [editingCell.field]: valueToSave }
          : store
      ));

      setEditingCell(null);
      setEditValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field');
      console.error('Error updating store:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const renderCell = (store: Store, field: keyof Store) => {
    const isEditing = editingCell?.id === store.id && editingCell?.field === field;
    const value = store[field];
    const displayValue = value === null ? '-' : String(value);

    if (isEditing) {
      return (
        <div className="flex items-center gap-2">
          <input
            type={['store_number', 'storeid', 'sms_count', 'sms_plan', 'promo_trigger', 'month_count'].includes(field) ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="block w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <button
            onClick={handleCellSave}
            disabled={savingId === store.id}
            className="p-1 text-green-600 hover:text-green-800"
          >
            <Check size={16} />
          </button>
          <button
            onClick={handleCellCancel}
            disabled={savingId === store.id}
            className="p-1 text-red-600 hover:text-red-800"
          >
            <X size={16} />
          </button>
        </div>
      );
    }

    return (
      <div
        onClick={() => handleCellClick(store, field)}
        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors"
      >
        {displayValue}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          <PlusCircle size={20} />
          Add Store
        </button>
        <h2 className="text-2xl font-bold text-gray-800">Store Records</h2>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="Search stores..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Add Store Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Add New Store</h3>
          <form onSubmit={handleSubmit} className="space-y-3 max-w-lg">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Store Number</label>
                <input
                  type="number"
                  value={formData.store_number}
                  onChange={(e) => setFormData({ ...formData, store_number: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Store ID</label>
                <input
                  type="number"
                  value={formData.storeid}
                  onChange={(e) => setFormData({ ...formData, storeid: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Store Name</label>
                <input
                  type="text"
                  value={formData.store_name}
                  onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                  placeholder="+1XXXXXXXXXX"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">PIN</label>
                <input
                  type="text"
                  value={formData.pin}
                  onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                  maxLength={4}
                  pattern="[0-9]+"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SMS Plan</label>
                <input
                  type="number"
                  value={formData.sms_plan}
                  onChange={(e) => setFormData({ ...formData, sms_plan: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SMS Count</label>
                <input
                  type="number"
                  value={formData.sms_count}
                  onChange={(e) => setFormData({ ...formData, sms_count: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Promo Name</label>
                <input
                  type="text"
                  value={formData.promo_name || ''}
                  onChange={(e) => setFormData({ ...formData, promo_name: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Promo Trigger</label>
                <input
                  type="number"
                  value={formData.promo_trigger}
                  onChange={(e) => setFormData({ ...formData, promo_trigger: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Month Count</label>
                <input
                  type="number"
                  value={formData.month_count}
                  onChange={(e) => setFormData({ ...formData, month_count: Number(e.target.value) })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Review SMS Message</label>
                <textarea
                  id="review_sms"
                  value={formData.review_sms}
                  onChange={(e) => setFormData({ ...formData, review_sms: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Review Link</label>
                <input
                  type="url"
                  id="review_link"
                  value={formData.review_link || ''}
                  onChange={(e) => setFormData({ ...formData, review_link: e.target.value })}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  placeholder="https://g.page/r/... or https://www.yelp.com/..."
                />
                <p className="mt-1 text-sm text-gray-500">Enter the URL for your Google or Yelp review page</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Checkout SMS Message</label>
                <textarea
                  value={formData.checkout_sms || ''}
                  onChange={(e) => setFormData({ ...formData, checkout_sms: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Promo SMS Message</label>
                <textarea
                  value={formData.promo_sms || ''}
                  onChange={(e) => setFormData({ ...formData, promo_sms: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Birthday SMS Message</label>
                <textarea
                  value={formData.birthday_sms || ''}
                  onChange={(e) => setFormData({ ...formData, birthday_sms: e.target.value })}
                  rows={3}
                  className="mt-1 block w-full rounded-md bg-gray-50 border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {isLoading ? 'Creating...' : 'Create Store'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Stores Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full divide-y divide-gray-200 table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store #
                </th>
                <th className="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store ID
                </th>
                <th className="w-48 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="w-36 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="w-24 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  PIN
                </th>
                <th className="w-64 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Review SMS
                </th>
                <th className="w-64 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Review Link
                </th>
                <th className="w-64 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Checkout SMS
                </th>
                <th className="w-64 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Birthday SMS
                </th>
                <th className="w-48 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Promo Name
                </th>
                <th className="w-64 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Promo SMS
                </th>
                <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Promo Trigger
                </th>
                <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SMS Count
                </th>
                <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SMS Plan
                </th>
                <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Month Count
                </th>
                <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : stores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No stores found
                  </td>
                </tr>
              ) : (
                stores.map((store) => (
                  <tr key={store.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'store_number')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'storeid')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'store_name')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'phone_number')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'pin')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'review_sms')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'review_link')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'checkout_sms')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'birthday_sms')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'promo_name')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'promo_sms')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'promo_trigger')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'sms_count')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'sms_plan')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {renderCell(store, 'month_count')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(store.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="w-full flex justify-between items-center">
              <button
                onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft size={20} className="mr-2" />
                Previous
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
                <ChevronRight size={20} className="ml-2" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreRecords;