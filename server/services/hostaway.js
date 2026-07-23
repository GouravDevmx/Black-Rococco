const axios = require('axios');

const HOSTAWAY_BASE_URL = 'https://api.hostaway.com/v1';

class HostawayService {
  constructor(apiKey, accountId) {
    this.apiKey = apiKey;
    this.accountId = accountId;
    this.client = axios.create({
      baseURL: HOSTAWAY_BASE_URL,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getAccessToken() {
    try {
      const response = await axios.post('https://api.hostaway.com/v1/accessTokens', {
        grant_type: 'client_credentials',
        client_id: this.accountId,
        client_secret: this.apiKey,
        scope: 'general',
      });
      return response.data.access_token;
    } catch (error) {
      console.error('Hostaway auth error:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Hostaway');
    }
  }

  async getAuthenticatedClient() {
    const token = await this.getAccessToken();
    return axios.create({
      baseURL: HOSTAWAY_BASE_URL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getListings() {
    try {
      const client = await this.getAuthenticatedClient();
      const response = await client.get('/listings');
      return response.data.result || [];
    } catch (error) {
      console.error('Hostaway listings error:', error.response?.data || error.message);
      throw new Error('Failed to fetch listings from Hostaway');
    }
  }

  async getListing(listingId) {
    try {
      const client = await this.getAuthenticatedClient();
      const response = await client.get(`/listings/${listingId}`);
      return response.data.result;
    } catch (error) {
      console.error('Hostaway listing error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch listing ${listingId}`);
    }
  }

  async getCalendar(listingId, startDate, endDate) {
    try {
      const client = await this.getAuthenticatedClient();
      const response = await client.get(`/listings/${listingId}/calendar`, {
        params: { startDate, endDate },
      });
      return response.data.result || [];
    } catch (error) {
      console.error('Hostaway calendar error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch calendar for listing ${listingId}`);
    }
  }

  async getPricing(listingId, startDate, endDate) {
    try {
      const client = await this.getAuthenticatedClient();
      const response = await client.get(`/listings/${listingId}/calendar`, {
        params: { startDate, endDate },
      });
      return response.data.result || [];
    } catch (error) {
      console.error('Hostaway pricing error:', error.response?.data || error.message);
      return [];
    }
  }

  transformListing(listing) {
    return {
      hostaway_id: listing.id,
      name: listing.name || 'Unnamed Property',
      description: listing.description || '',
      property_type: listing.propertyTypeId ? String(listing.propertyTypeId) : '',
      address: listing.address || '',
      city: listing.city || '',
      state: listing.state || '',
      country: listing.countryCode || '',
      zipcode: listing.zipcode || '',
      latitude: listing.lat || null,
      longitude: listing.lng || null,
      bedrooms: listing.bedrooms || 0,
      bathrooms: listing.bathrooms || 0,
      max_guests: listing.maxGuests || listing.personCapacity || 1,
      base_price: listing.basePrice || listing.price || 0,
      currency: listing.currencyCode || 'USD',
      cleaning_fee: listing.cleaningFee || 0,
      thumbnail_url: listing.thumbnailUrl || listing.picture || '',
      images: JSON.stringify(listing.photos || listing.images || []),
      amenities: JSON.stringify(listing.amenities || []),
      check_in_time: listing.checkInTime || '15:00',
      check_out_time: listing.checkOutTime || '11:00',
      house_rules: listing.houseRules || '',
      is_active: listing.isActive !== false,
      last_synced_at: new Date().toISOString(),
      raw_data: JSON.stringify(listing),
    };
  }
}

module.exports = HostawayService;
